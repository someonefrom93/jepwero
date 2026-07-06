# IaC Repo Spec

> SDD capability: `iac-repo` — separate `jochos-epw-infra` repository that
> owns the Terraform modules, per-environment state, IAM deploy roles, and
> CI workflows which create and operate the `static-hosting` resources in
> AWS. Authored from the `aws-static-hosting` proposal.

## Purpose

`iac-repo` defines a sibling repository to the app repo (`jochos-epw`)
named `jochos-epw-infra` whose sole responsibility is infrastructure as
code. It holds the Terraform modules for S3, CloudFront, Route53, ACM,
and IAM, plus per-environment directories (`dev/` to start), the remote
state backend (S3 with DynamoDB lock), and the GitHub Actions workflows
that plan and apply the infra. The capability also defines the
app-repo-side workflow that consumes infra via OIDC and syncs the static
assets. The boundary between repos is enforced by the workflow design:
the app repo consumes infra through CI; the infra repo owns the state
and the resource graph.

## Requirements

### Requirement: jochos-epw-infra repository layout

A separate repository named `jochos-epw-infra` MUST exist as a sibling to
the app repo `jochos-epw`. The repo MUST contain a `modules/` directory
holding reusable Terraform modules, a top-level `README.md` (see
infra-repo README requirement below), and per-environment directories
(`dev/` to start; `prod/` is a follow-up and is not part of this
change). The repo MUST NOT contain the static-site application code
(`burger-site-draft/`); that code lives in the app repo and is
synced to the bucket by the deploy workflow.

#### Scenario: jochos-epw-infra exists as a sibling repo

- Given the GitHub organization `<infra-repo-org>` is decided
- When the repos in the org are listed
- Then both `jochos-epw` (app) and `jochos-epw-infra` (infra) MUST exist
- And the two repos MUST be siblings (neither nested in the other)

#### Scenario: repo layout has modules, envs, and README

- Given `jochos-epw-infra` exists
- When the repo root is listed
- Then a `modules/` directory MUST be present
- And a `dev/` directory MUST be present
- And a top-level `README.md` MUST be present
- And no `burger-site-draft/` directory MAY be present

#### Scenario: prod env is a follow-up, not in this change

- Given this change is in scope
- When `jochos-epw-infra` is inspected
- Then a `prod/` directory MUST NOT be present
- And the README MUST describe the prod-env follow-up without committing
  to it in this change

### Requirement: Remote state in S3 with DynamoDB lock, no local state

Terraform state for every workspace and environment MUST live in an S3
bucket with a DynamoDB lock table. No environment or module MAY use
local state, no `terraform.tfstate` file MAY be checked into the repo,
and the state backend MUST be referenced via a `remote-backend.tf`
file or its `terraform` block equivalent. The state bucket itself MUST
have `BlockPublicAccess` set to `on` for all four flags and MUST have a
lifecycle rule that prunes noncurrent state versions after a bounded
number of days (30 days recommended, but the contract is "any
lifecycle rule that prunes noncurrent versions").

#### Scenario: state backend is configured for the dev environment

- Given the `dev/` environment directory exists
- When its `remote-backend.tf` (or its top-level `terraform` block) is
  inspected
- Then it MUST declare an S3 backend with a `bucket`, `key`, `region`,
  and `dynamodb_table` attribute
- And the `key` MUST include the environment name (e.g.
  `jochos-epw/dev/terraform.tfstate`)
- And no `path` (local backend) MAY be configured

#### Scenario: no local state file is committed to the repo

- Given the `jochos-epw-infra` repo is checked out
- When `git ls-files` is run
- Then no file matching `*.tfstate` or `*.tfstate.backup` MAY appear in
  the tracked file list
- And the `.gitignore` MUST include `*.tfstate`, `*.tfstate.backup`,
  `.terraform/`, and `terraform.tfvars` (or equivalent secrets
  exclusion)

#### Scenario: state bucket has BlockPublicAccess and lifecycle

- Given the state bucket exists in the AWS account
- When its `BlockPublicAccess` and lifecycle configuration are inspected
- Then `BlockPublicAccess` MUST be `on` for all four flags
- And at least one lifecycle rule MUST be present whose
  `NoncurrentVersionExpiration` is set to a non-null value
- And the bucket MUST have versioning enabled

#### Scenario: state lock is enforced via DynamoDB

- Given two `terraform apply` invocations are started in parallel
  against the same dev state file
- When the second invocation attempts to acquire the lock
- Then it MUST fail with an error indicating the lock is held
- And the DynamoDB lock table MUST contain a row keyed by the state file
  path while the first apply is running

### Requirement: Plan-only CI on PR, manual approval to apply

A GitHub Actions workflow MUST run `terraform plan` on every pull
request against the infra repo. The plan MUST be uploaded as a PR
comment or workflow artifact so reviewers can see the diff. The apply
step MUST NOT run on a PR; it MUST require a manual approval (a
`production` / `apply` environment gate, or an explicit
`workflow_dispatch` trigger) before running. The CI MUST be able to run
plan-only against zero AWS resources (S1) and against real resources
(S2-S5) without ever applying automatically.

#### Scenario: opening a PR runs plan and posts the diff

- Given a PR is opened against `main` in `jochos-epw-infra`
- When the GitHub Actions workflow runs
- Then `terraform init` MUST run
- And `terraform plan -out=tfplan.binary` MUST run
- And the plan output MUST be posted to the PR as a comment (or
  uploaded as an artifact) before the workflow exits
- And no `terraform apply` step MUST execute in the PR workflow

#### Scenario: apply requires manual approval

- Given the PR is merged to `main`
- When the post-merge workflow runs
- Then the workflow MUST require a manual approval before the
  `terraform apply` step runs (e.g. via a GitHub `environment`
  protection rule on `production`)
- And if the approval is denied, the apply MUST NOT run

#### Scenario: S1 plan-only run touches zero AWS resources

- Given the `jochos-epw-infra` repo is freshly bootstrapped with the S1
  slice (repo skeleton, no resources defined)
- When the PR workflow runs `terraform plan`
- Then the plan output MUST show `No changes. Your infrastructure matches
  the configuration.`
- And no AWS API call beyond the (optional) state bucket and DynamoDB
  table bootstrap MUST be made

### Requirement: App-repo deploy workflow consumes infra via OIDC

A separate GitHub Actions workflow MUST live in the app repo
`jochos-epw` (not in `jochos-epw-infra`). The workflow MUST authenticate
to AWS via OIDC assumeRole using a role defined by `iac-repo`. On a
merge to `main` in the app repo, the workflow MUST: (1) run
`terraform apply -auto-approve` against the dev environment, (2)
`s3 sync` the four HTML files plus `supabase-config.js` from
`burger-site-draft/` to the dev bucket, and (3) issue exactly one
`aws cloudfront create-invalidation` for the changed paths, unless
`DISABLE_INVALIDATION` is set (see `static-hosting` requirement on
invalidation batching). The workflow MUST NOT chain to a `prod`
environment in this change.

#### Scenario: merge to main in the app repo triggers the deploy

- Given the app repo `jochos-epw` has a one-character edit in
  `burger-site-draft/index.html`
- When the PR is merged to `main`
- Then the deploy workflow MUST run
- And the workflow MUST `terraform apply -auto-approve` against the dev
  workspace
- And the workflow MUST run `aws s3 sync` of the four HTML files plus
  `supabase-config.js` to the dev bucket
- And the workflow MUST issue exactly one
  `aws cloudfront create-invalidation --paths "/index.html" ...` (or
  `/*` if batching is enabled)

#### Scenario: deploy does not run on PRs

- Given a PR is opened against `main` in the app repo
- When the deploy workflow's triggers are inspected
- Then the workflow MUST be triggered by `push` to `main` (or by
  `workflow_dispatch`), but MUST NOT be triggered by `pull_request`
- And no `terraform apply` MAY run on a PR
- And no `aws s3 sync` MAY run on a PR

#### Scenario: deploy role is assumed via OIDC, not static keys

- Given the deploy workflow runs
- When its `aws-actions/configure-aws-credentials` (or equivalent) step
  is inspected
- Then it MUST use the OIDC token exchange (no `AWS_ACCESS_KEY_ID` or
  `AWS_SECRET_ACCESS_KEY` in env or secrets)
- And the role-to-assume MUST be the deploy role defined in
  `jochos-epw-infra`, scoped per the `static-hosting` OIDC requirement

#### Scenario: dev bucket and dev distribution are the only targets

- Given the deploy workflow runs
- When its environment variables (or Terraform variables) are
  inspected
- Then the S3 bucket MUST be the dev bucket, not a prod bucket
- And the CloudFront distribution MUST be the dev distribution, not a
  prod distribution
- And the workspace / state key MUST include the `dev` segment

### Requirement: Infra-repo README covers the four required procedures

The `jochos-epw-infra` README MUST contain, at minimum, four sections:
(1) **Prerequisites** — AWS account, Route53 registrar access, GitHub
org access, and any local tools the engineer needs (terraform, aws
cli); (2) **Bootstrap a new environment** — the ordered procedure to
bring a new env from zero to a green `terraform plan` (state bucket
and DynamoDB lock table first, then the env's own resources); (3)
**Rotate state** — the procedure to recover a corrupted or stale state
file by pulling a previous version from the versioned S3 state bucket;
(4) **Roll back a deploy** — the procedure to revert an apply, either
by restoring a previous state version and re-applying, or by
targeted `terraform destroy` on the changed resource. Each section MUST
be runnable as written by a second engineer who has not seen the repo
before.

#### Scenario: README has a Prerequisites section that names the four dependencies

- Given the `jochos-epw-infra` README exists
- When the "Prerequisites" section is read
- Then it MUST list: an AWS account with permission to create the
  resources in scope, access to the Route53 registrar to point the
  domain at the new zone's name servers, access to the GitHub
  organization to register the OIDC provider and create the secrets,
  and the local tools (terraform CLI, aws CLI) with their minimum
  versions

#### Scenario: README has a Bootstrap a new environment procedure

- Given the README is read
- When the "Bootstrap a new environment" section is read
- Then it MUST describe, in order: creating the state bucket, creating
  the DynamoDB lock table, creating the Route53 zone (if not already
  present), updating the env's `terraform` block to point at the
  state, running `terraform init`, and running `terraform plan` to
  verify zero diff

#### Scenario: README has a Rotate state procedure

- Given the README is read
- When the "Rotate state" section is read
- Then it MUST describe how to list versions of the state object in
  S3, how to identify a known-good version, and the exact `aws s3api`
  or `aws s3 cp` command to copy that version back to the live state
  key, and how to verify the result with `terraform plan` showing no
  drift

#### Scenario: README has a Roll back a deploy procedure

- Given the README is read
- When the "Roll back a deploy" section is read
- Then it MUST describe how to identify the last-green apply
  (e.g. via git tag or workflow run), how to revert the relevant
  Terraform change (either `git revert` + re-apply, or
  `terraform apply -target=<resource>` with a previous state
  version), and how to roll back a bad HTML deploy specifically
  (the `aws s3 cp` + `versionId` pattern from the `static-hosting`
  rollback plan)

### Requirement: App repo and infra repo boundary is enforced

The boundary between the app repo `jochos-epw` and the infra repo
`jochos-epw-infra` MUST be enforced by the workflow design: the app
repo MUST consume infra via CI (OIDC assumeRole into a deploy role
defined in the infra repo) and MUST NOT contain Terraform
configuration that defines the AWS resources directly; the infra
repo MUST own the resource graph (modules, env directories, state,
IAM) and MUST NOT contain application code. CI workflows that
mutate AWS MUST live in whichever repo owns the change (infra
changes in `jochos-epw-infra`, content deploys in `jochos-epw`).

#### Scenario: app repo does not contain Terraform resource definitions

- Given the app repo `jochos-epw` is checked out
- When `*.tf` files are listed under the app repo root
- Then no file defining an `aws_*` resource (e.g.
  `aws_s3_bucket`, `aws_cloudfront_distribution`,
  `aws_route53_zone`, `aws_acm_certificate`, `aws_iam_role`) MAY
  exist in the app repo
- And the app repo MAY contain only a thin deploy workflow (YAML)
  that calls into the infra repo's role

#### Scenario: infra repo does not contain application code

- Given the infra repo `jochos-epw-infra` is checked out
- When the repo tree is listed
- Then no `burger-site-draft/` directory MAY be present
- And no `index.html`, `menu.html`, `checkout.html`, `admin.html`,
  or `supabase-config.js` MAY be tracked
- And the infra repo's deploy path (if any) MUST source static
  assets from the app repo's `burger-site-draft/` rather than
  carrying its own copy

#### Scenario: deploy workflow lives in the app repo, not the infra repo

- Given both repos exist
- When their `.github/workflows/` directories are listed
- Then the workflow that syncs static assets to S3 and issues
  CloudFront invalidations MUST live in the app repo
- And the workflows that run `terraform plan` / `terraform apply`
  against the infra repo MUST live in the infra repo (or, for the
  app-repo-side `apply`, in the app repo with the role defined in
  the infra repo)

## Out of scope

- Migrating Supabase to AWS. Supabase stays at
  `https://ouhwfkxpxikqhwcqioc.supabase.co` exactly as it is.
- The `prod` environment. Same module will support it, but only
  `dev/` is wired in this change.
- Multi-region failover, multi-account topology, or AWS Control Tower
  integration.
- Reusable shared modules outside the `jochos-epw-infra` repo (e.g.
  an internal Terraform registry). Modules live in-repo for the
  MVP.
- Drift detection / continuous reconciliation outside of GitHub
  Actions (e.g. a scheduled `terraform plan` cron). Drift is caught
  on the next PR.
- State encryption with a customer-managed CMK. Default S3
  encryption (SSE-S3 / SSE-KMS with AWS-managed key) is acceptable
  for the MVP.

## Dependencies

- The `static-hosting` capability, which defines the runtime
  resources (S3 bucket, CloudFront distribution, Route53 zone, ACM
  cert, IAM role) that this capability's Terraform describes.
- An AWS account with permission to create IAM OIDC providers, S3
  buckets, DynamoDB tables, and the resources enumerated in
  `static-hosting`.
- A GitHub organization capable of hosting the
  `jochos-epw-infra` repo and registering the OIDC trust
  (`token.actions.githubusercontent.com`).
- A Route53-registered domain for the dev environment (placeholder
  `<dev-domain>` until the open question is resolved).

## Carry-over open questions

These are NOT requirements and they do NOT block this spec. They are
risks for the apply phase and SHOULD be resolved before the relevant
slice lands.

1. **Domain name** — the dev domain is a placeholder `<dev-domain>`
   in the related `static-hosting` spec and is needed before S4
   (Route53 + DNSSEC) lands. Suggest `dev.jochosepw.com` (or
   similar) under a new Route53 zone. Confirm before S4.
2. **Dev-only OK** — yes for this change. The `prod/` environment
   directory is not part of this change; same module will support
   it later as a follow-up slice.
3. **Infra-repo org placement** — `<infra-repo-org>` is a
   placeholder. The new `jochos-epw-infra` repo is scaffolded as a
   sibling; final GitHub org placement is decided at apply time.
4. **Project rename** — `jochos-epw` is the current working name
   per `openspec/config.yaml`. If a rename is happening, the repo
   names (`jochos-epw`, `jochos-epw-infra`) and the dev domain
   SHOULD reflect the final name. Surface the final name before
   the S1 slice lands to avoid rename churn mid-bootstrap.
