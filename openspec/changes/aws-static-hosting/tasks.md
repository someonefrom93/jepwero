# Tasks: AWS Static Hosting (`aws-static-hosting`)

> **SDD phase**: tasks (executor)
> **Change**: `aws-static-hosting`
> **Inputs consumed**: `openspec/changes/aws-static-hosting/proposal.md`,
> `openspec/specs/static-hosting/spec.md`,
> `openspec/specs/iac-repo/spec.md`,
> `openspec/changes/aws-static-hosting/design.md`,
> `openspec/config.yaml` (`rules.tasks` applied verbatim below).
> **Outputs**: this document + Engram `sdd/aws-static-hosting/tasks`.
>
> `rules.tasks` applicability check (verbatim from `openspec/config.yaml`):
>
> 1. "Group by phase, use hierarchical numbering" — **APPLIED**. Each
>    slice is a phase (`1.` through `6.`); subtasks use `1.1`,
>    `1.1.1`, etc.
> 2. "Keep tasks completable without a build pipeline" — **APPLIED**.
>    Every task in this change is an AWS CLI / Terraform / GitHub-Actions
>    YAML / shell command. No bundler, no transpiler, no test runner.
>    Verification is bash + `aws` + `gh` + `dig` + `curl` from a
>    developer's laptop (per design §13).
>
> The `iac-repo` is a sibling repo (no `jochos-epw` boundary crossing
> except the S5 deploy workflow). App repo (`jochos-epw`) is FROZEN
> during S1–S4 per spec invariant 1; only S5 edits `jochos-epw`.

## Quick path

- **Phase 0** — clear four blockers (domain name, dev-only scope,
  infra-repo org, project rename). Each blocker is one async
  conversation; no code lands until they are answered. They are
  surfaced via the apply phase's ask-on-risk gate (`delivery_strategy:
  ask-on-risk` set at preflight).
- **Phase 1 — Slice S1** — bootstrap `jochos-epw-infra` repo:
  README skeleton, Terraform skeleton, state backend bootstrap,
  remote backend wiring, plan-only CI with OAI-lint gate.
  Idempotent plan-only.
- **Phase 2 — Slice S2** — private S3 bucket + OAC. **No bucket
  policy** (lands in S3 with the distribution's ARN Condition).
- **Phase 3 — Slice S3** — CloudFront distribution + DNS-validated
  ACM cert (cert will be `PENDING_VALIDATION` until S4) + response
  headers policy + the OAC-restricting bucket policy. Route53 zone is
  **NOT** in this slice; smoke test uses the native `<dist>.cloudfront.net`
  domain.
- **Phase 4 — Slice S4** — Route53 hosted zone, KMS-backed KSK,
  DNSSEC signing, alias A/AAAA records to CloudFront, ACM validation
  CNAME records. **This is the slice that flips DNS to `<dev-domain>`.**
- **Phase 5 — Slice S5** — second OIDC trust for infra-repo CI,
  deploy role, app-repo `.github/workflows/deploy.yml`. End-to-end
  deploy verified by a one-char edit on `main`.
- **Phase 6 — Slice S6 (OPTIONAL)** — `prod/` env directory as a
  follow-up. Only started after Phase 5 has been merged + stable for
  one cycle.

Each slice lands as a single PR ≤ ~400 lines of diff (per design §4
budgets and `iac-repo` invariant 9). Verify commands are wired from
design §13 and quoted in each task's **Done when** clause.

## Decisions to record

`openspec/changes/aws-static-hosting/decisions.md` is created in
Slice S1 (Task **1.2.1**). Phase 0 blockers, infra-repo org decision,
and any non-obvious dev-time choices land there as a single
append-only file. The apply agent reads this file before starting
S2.

---

## Phase 0 — Resolve open questions (BLOCKERS — must complete before Phase 1)

> **Block scope**: every slice from S2 onward consumes either the dev
> domain (S4), the bucket-name derived from the project rename (S2),
> the infra-repo org (referenced by every slice), or confirmation
> that dev-only is OK (relaxes the S6 dependency on a NameCheap or
> equivalent registrar handoff). Tasks in phases 1–5 use
> `<!-- BLOCKED-UNTIL: 0.N -->` annotations that the orchestrator /
> apply agent reads.

### 0.1 — Resolve the dev domain

> <!-- spec: openspec/changes/aws-static-hosting/proposal.md#open-questions-1,
>      spec carry-over: openspec/specs/static-hosting/spec.md#carry-over-open-questions-1,
>      design: §11 -->

- **0.1.1** The orchestrator asks the user (via ask-on-risk surface in
  the apply phase): pick `<dev-domain>` from `dev.jochosepw.com`,
  `dev.jepwero.com`, or another name under a new Route53 hosted zone.
- **0.1.2** The orchestrator confirms that the picked name is **not** a
  subdomain of `*.supabase.co` or `*.supabase.io` and does not equal
  those apexes (per `static-hosting` spec scenario "dev domain is not
  a Supabase subdomain").
- **Done when** `<dev-domain>` is written to
  `openspec/changes/aws-static-hosting/decisions.md` under the heading
  `## Dev domain` with the literal hostname, a one-line justification,
  and the date the user confirmed it.

### 0.2 — Confirm dev-only scope

> <!-- spec: openspec/changes/aws-static-hosting/proposal.md#open-questions-2,
>      design: §4.6, §11 -->

- **0.2.1** The orchestrator asks the user to confirm that this change
  ships ONLY the `dev` environment and that `prod` is the optional S6
  follow-up slice.
- **0.2.2** If the user wants both, the orchestrator splits prod into a
  parallel change tracker so the 400-line budget holds per PR.
- **Done when** `## Scope` heading in
  `openspec/changes/aws-static-hosting/decisions.md` records
  `dev-only in this change; prod deferred to S6 follow-up` (or the
  alternative if explicitly diverged).

### 0.3 — Pick GitHub org for `jochos-epw-infra`

> <!-- spec: openspec/changes/aws-static-hosting/proposal.md#open-questions-3,
>      spec: openspec/specs/iac-repo/spec.md#carry-over-open-questions-3,
>      design: §11 -->

- **0.3.1** The orchestrator asks the user whether the infra repo
  lives under the same org as `<app-repo-org>/jochos-epw` or a
  different one. Same-org keeps OIDC trusts simpler; different-org
  is required when infra is org-shared but app is per-team.
- **0.3.2** The orchestrator records the chosen `<infra-repo-org>` in
  `openspec/changes/aws-static-hosting/decisions.md`.
- **Done when** `## Infra repo org` heading records
  `<infra-repo-org>` with date and confirmation.

### 0.4 — Decide project rename

> <!-- spec: openspec/changes/aws-static-hosting/proposal.md#open-questions-4,
>      design: §11 -->

- **0.4.1** The orchestrator asks the user whether the project is being
  renamed away from `jochos-epw`. If yes, the user surfaces the final
  name now so bucket names, IAM role names, state bucket name, OIDC
  trust condition, and the dev domain all use the new name from S1
  forward.
- **0.4.2** If the rename happens mid-change, every Terraform resource
  ARN prefix, every `name_prefix` variable default, the state-bucket
  name, and the OIDC `sub` claim's repo segment must be regenerated —
  the orchestrator flags this as a multi-day churn and recommends
  locking the rename to this change's tail (after S5 ships).
- **Done when** `## Final project name` heading records either
  `jochos-epw (no rename)` or `<new-name>`.

### 0.5 — Slush fund for Phase 0 (apply-phase-only)

- **Done when** all four `decisions.md` headings (`Dev domain`,
  `Scope`, `Infra repo org`, `Final project name`) are populated.
  Phases 1+ cannot start until this gate is satisfied.

---

## Phase 1 — Slice S1: `jochos-epw-infra` repo bootstrap

> **Spec contracts**:
> `iac-repo/Repository layout`, `iac-repo/Remote state in S3 with
> DynamoDB lock`, `iac-repo/Plan-only CI on PR`.
> **Design**: §4.1, §7, §10, §12.
> **Verify rows**: 1, 26–31.
> **Line budget**: ~250 lines.
> **Status**: blocked by Phase 0 (tasks 1.4, 1.5 depend on
> `<infra-repo-org>` from 0.3; tasks 1.4 also need a name prefix from
> 0.4).

### 1.1 — Create the `jochos-epw-infra` repo

> <!-- BLOCKED-UNTIL: 0.3 -->

- **1.1.1** Create an empty repo named `jochos-epw-infra` under
  `<infra-repo-org>` via the GitHub UI or
  `gh repo create <infra-repo-org>/jochos-epw-infra --private --description "Terraform + GitHub Actions for jochos-epw static hosting"`.
- **1.1.2** Confirm the orchestrator (or whoever runs the CI) has at
  least `maintain` access on the new repo.
- **Done when** `gh repo view <infra-repo-org>/jochos-epw-infra
  --json name,visibility` returns the repo metadata; the orchestrator
  records the SSH/HTTPS URL in `decisions.md` under
  `## Infra repo URL`.

### 1.2 — Add the README skeleton

> <!-- spec: openspec/specs/iac-repo/spec.md#infra-repo-README-covers-the-four-required-procedures,
>      design: §4.1, verify row 28 -->

- **1.2.1** Create `README.md` at the repo root with the four required
  section headings: `## Prerequisites`, `## Bootstrap a new
  environment`, `## Rotate state`, `## Roll back a deploy`. Each
  section starts with a `(filled in by slice S<number>)` placeholder
  line so reviewers see the section is intentional, not missing.
- **1.2.2** Also create `openspec/changes/aws-static-hosting/decisions.md`
  on disk in the app repo (this is the canonical decision record the
  apply agent reads later). Write the four headings `## Dev domain`,
  `## Scope`, `## Infra repo org`, `## Final project name`, `## Infra
  repo URL` with "TBD — pending Phase 0" placeholders.
- **Done when** `grep -E '^## (Prerequisites|Bootstrap a new
  environment|Rotate state|Roll back a deploy)' README.md` returns
  four matches; and `decisions.md` exists with the five headings.

### 1.3 — Terraform skeleton + `versions.tf` + provider pin

> <!-- design: §4.1, §12 rows 1–2 -->

- **1.3.1** Add `versions.tf` at the repo root with:
  - `terraform { required_version = "~> 1.9" }`
  - `terraform { required_providers { aws = { source =
    "hashicorp/aws", version = "~> 5.0" } } }`
- **1.3.2** Add `modules/backend/` (empty modules for now —
  `main.tf`, `variables.tf`, `outputs.tf` stub files declaring the
  module metadata; the S3-backend wiring lands in 1.5).
- **1.3.3** Add `envs/dev/` with `main.tf` (composes nothing yet —
  just the `terraform { required_providers {} }` block), `variables.tf`
  declaring `name_prefix` with `default = "jochos-epw-dev"`, and empty
  `outputs.tf`.
- **1.3.4** Add top-level `.gitignore` containing `*.tfstate`,
  `*.tfstate.backup`, `.terraform/`, `terraform.tfvars`,
  `terraform.tfvars.json`, `.DS_Store`.
- **Done when** `terraform -chdir=envs/dev init -backend=false -input=false`
  succeeds locally; `terraform -chdir=envs/dev validate` exits 0.

### 1.4 — Bootstrap directory (one-shot state resources)

> <!-- BLOCKED-UNTIL: 0.4 (project name in `state_bucket_name`)
>      spec: openspec/specs/iac-repo/spec.md#remote-state-in-S3-with-DynamoDB-lock-no-local-state,
>      design: §4.1, §7, verify rows 26, 27, 29 -->

- **1.4.1** Add `bootstrap/main.tf` creating:
  - `aws_s3_bucket` for state — `BlockPublicAccess` on all four flags,
    versioning on, lifecycle rule
    `NoncurrentVersionExpiration { noncurrent_days = 30 }`,
    `ServerSideEncryptionConfiguration` with `AES256`, object
    ownership `BucketOwnerEnforced`.
  - `aws_dynamodb_table` for the lock — PK `LockID` (string),
    `BillingMode = "PAY_PER_REQUEST"`,
    `PointInTimeRecovery { enabled = true }`.
- **1.4.2** Add `bootstrap/variables.tf` with
  `state_bucket_name` (default `<final-project-name>-tfstate-<account-id>-<region>`),
  `lock_table_name` (default `<final-project-name>-tflock`),
  `region`.
- **1.4.3** Add `bootstrap/outputs.tf` exposing
  `state_bucket_arn` and `lock_table_name`.
- **1.4.4** The orchestrator instructs the user to run
  `terraform -chdir=bootstrap init && terraform -chdir=bootstrap apply`
  from a laptop with credentials that can create S3 + DynamoDB. Local
  state is acceptable here — bootstrap is one-shot.
- **Done when** the user pastes both the state bucket ARN and the lock
  table name into `decisions.md` under
  `## Bootstrap resources`; `aws s3api get-public-access-block --bucket
  <state-bucket>` returns all four flags `true`; `aws dynamodb describe-table
  --table-name <lock-table>` returns `TableStatus=ACTIVE`,
  `BillingModeSummary.BillingMode=PAY_PER_REQUEST`,
  `KeySchema[0].AttributeName=LockID`.

### 1.5 — Remote backend wiring

> <!-- BLOCKED-UNTIL: 1.4, 0.3, 0.4
>      spec: openspec/specs/iac-repo/spec.md#state-backend-is-configured-for-the-dev-environment,
>      design: §4.1, §7 -->

- **1.5.1** Add `envs/dev/remote-backend.tf` with a `terraform { backend
  "s3" { ... } }` block sourcing `bucket`, `key` (=
  `<final-project-name>/dev/terraform.tfstate`), `region`, and
  `dynamodb_table` from the bootstrap outputs recorded in
  `decisions.md`.
- **1.5.2** Commit `remote-backend.tf`. Do NOT commit the terraform.tfvars
  file with secrets (`.gitignore` already excludes it from 1.3.4).
- **Done when** `terraform -chdir=envs/dev init -input=false` succeeds
  against the real backend; `git ls-files | grep -E '\.tfstate($|\.backup$)'`
  returns nothing (verify row 31).

### 1.6 — Plan-only CI workflow with OAI-lint gate

> <!-- spec: openspec/specs/iac-repo/spec.md#Plan-only-CI-on-PR-manual-approval-to-apply,
>      design: §4.1, §10, §12 row 13, verify row 30 -->

- **1.6.1** Add `.github/workflows/plan.yml` per design §10 — triggers
  on `pull_request` (paths filtered to `**/*.tf`, `**/*.tfvars`,
  `.github/workflows/plan.yml`) and `workflow_dispatch` (with an
  `apply` boolean input for the manual gate).
- **1.6.2** Include the **OAI invariant guard** step (per design
  §10 / cross-cutting choice 13): `grep -rE
  'aws_cloudfront_origin_access_identity' modules/` and `exit 1` on
  match with the message `"OAI is FORBIDDEN by static-hosting spec.
  Use aws_cloudfront_origin_access_control instead."`.
- **1.6.3** Permissions block: `permissions: contents: read,
  pull-requests: write, id-token: write` (id-token is required for
  the §6 OIDC trust used on workflow_dispatch path).
- **1.6.4** Plan-only path: `terraform fmt -check -recursive ../..`, then
  `terraform init -backend=false`, then `terraform validate`, then
  `terraform plan -detailed-exitcode -out=tfplan.binary`, then
  `terraform show -no-color tfplan.binary > tfplan.txt`, then
  `actions/upload-artifact` + `actions/github-script` posts the plan as
  a PR comment.
- **1.6.5** Apply path: requires `github.event_name ==
  'workflow_dispatch' && inputs.apply == 'true' &&
  vars.tools/apply == 'true'` plus a `production` environment with a
  required-reviewer protection rule.
- **Done when** opening a test PR against the new repo runs plan + lint
  + posts the plan diff as a PR comment (verify row 30: one match for
  `token.actions.githubusercontent.com` in the workflow YAML).

### 1.7 — S1 green verify

> <!-- spec: openspec/specs/iac-repo/spec.md#S1-plan-only-run-touches-zero-AWS-resources,
>      design: §13 verify row 1 -->

- **1.7.1** Confirm `terraform -chdir=envs/dev plan -detailed-exitcode`
  returns exit code `0` (no diff to plan). With no resources defined
  yet, the plan output is `No changes. Your infrastructure matches the
  configuration.`
- **1.7.2** Confirm the OAI-lint step ran in CI and found no matches.
- **Done when** both checks pass; the orchestrator marks Slice S1 green
  in `decisions.md` under `## Slice status`.

---

## Phase 2 — Slice S2: S3 bucket + OAC

> **Spec contracts**: `static-hosting/S3 bucket privacy and ingress
> control`, `static-hosting/CloudFront uses Origin Access Control
> (OAC)`, `static-hosting/Supabase boundary`.
> **Design**: §4.2, §12 row 12, verify rows 2–5.
> **Line budget**: ~150 lines.
> **Status**: blocked by Phase 0 (bucket name from 0.4; domain suffix
> separation from 0.1).

### 2.1 — `modules/s3-static-site` HCL

> <!-- BLOCKED-UNTIL: 0.4, 0.1
>      spec: openspec/specs/static-hosting/spec.md#s3-bucket-privacy-and-ingress-control,
>      design: §4.2, §12 row 12, verify rows 2–5, 19, 23 -->

- **2.1.1** Add `modules/s3-static-site/main.tf` declaring:
  - `resource "aws_s3_bucket" "this"` with `bucket =
    var.bucket_name`.
  - `resource "aws_s3_bucket_public_access_block" "this"` with **all
    four flags `true`** (per design §4.2 + spec scenario "S3
    BlockPublicAccess is on for all four flags").
  - `resource "aws_s3_bucket_versioning" "this"` with
    `Status = "Enabled"`.
  - `resource "aws_s3_bucket_lifecycle_configuration" "this"` with a
    rule `NoncurrentVersionExpiration { noncurrent_days = 30 }`.
  - **NO `aws_s3_bucket_policy`** in this module — per design
    Option A, the policy lands in `modules/cloudfront-static` (S3)
    because its `Condition` references the distribution ARN.
  - `resource "aws_s3_bucket_server_side_encryption_configuration"
    "this"` with `rule.apply_server_side_encryption_by_default.sse_algorithm
    = "AES256"` (KMS is overkill per design §12 row 3).
  - `aws_cloudfront_origin_access_control` resource with the explicit
    HCL from design §4.2: `signing_behavior = "always"`,
    `signing_protocol = "sigv4"`,
    `origin_access_control_origin_type = "s3"`.
- **2.1.2** Add `modules/s3-static-site/variables.tf` with
  `bucket_name` declared with a `validation` block that:
  - rejects any value containing `"supabase"` (case-insensitive, per
    spec scenario "bucket name does not contain the substring
    'supabase'");
  - enforces `length(var.bucket_name) <= 63`;
  - enforces the regex `^[a-z0-9-]+$` (lowercase, no underscores).
- **2.1.3** Add `modules/s3-static-site/outputs.tf` exposing
  `bucket_arn`, `bucket_domain_name`, and `oac_id`.
- **2.1.4** Modify `envs/dev/main.tf` to compose `module
  "s3_static_site"` with `bucket_name = var.bucket_name` (and pass
  `name_prefix = var.name_prefix` for downstream tagging).
- **2.1.5** Modify `envs/dev/variables.tf` to add `bucket_name` (no
  default — must be provided).
- **Done when** `terraform -chdir=envs/dev apply` (with manual approval
  gate from S1's CI workflow) creates the bucket + OAC only;
  `aws s3api get-public-access-block --bucket <bucket>` returns all
  four flags `true`; `aws cloudfront get-origin-access-control
  --id <oac-id>` returns `SigningBehavior=always` AND
  `SigningProtocol=sigv4`.

### 2.2 — S2 green verify

> <!-- design: §13 verify rows 2, 3, 5, 19, 23 -->

- **2.2.1** Run `aws s3api get-bucket-policy-status --bucket <bucket>`
  → must return `IsPublic: false` (there is no bucket policy yet —
  `IsPublic: false` holds because BlockPublicAccess is on, not because
  a non-public policy is attached).
- **2.2.2** Run `curl https://<bucket>.s3.amazonaws.com/index.html`
  (unauthenticated) → must return `403 AccessDenied` with no object
  bytes in the body.
- **2.2.3** Confirm `terraform state list` shows
  `aws_cloudfront_origin_access_control.this` and **does NOT** show
  any `aws_cloudfront_origin_access_identity`.
- **2.2.4** Confirm no bucket name in the AWS account contains the
  substring `supabase` (case-insensitive):
  `aws s3api list-buckets --query 'Buckets[?contains(to_lower(Name),
  \`supabase\`)].Name'` → empty.
- **Done when** all four checks return the expected results; the
  orchestrator records `## Slice S2 — green` in `decisions.md`.

---

## Phase 3 — Slice S3: CloudFront + ACM + bucket policy

> **Spec contracts**: `static-hosting/TLS-only viewer policy and HSTS
> on every response`, `static-hosting/ACM TLS certificate pinned to
> the distribution`, `static-hosting/Brotli at the edge, HTTP/2 and
> HTTP/3 enabled`, `static-hosting/Cache TTLs are HTML-300s and
> asset-1y`.
> **Design**: §4.3 (note Route53 deviation, §4.0 #1), §8, §9, §12
> row 6, §12 row 7, verify rows 6, 7, 9, 10, 11, 21, 22, 23.
> **Line budget**: ~250 lines.
> **Status**: blocked by S2.2 (needs OAC ID + bucket ARN).

### 3.1 — `modules/cloudfront-static` HCL

> <!-- BLOCKED-UNTIL: 2.2
>      spec: openspec/specs/static-hosting/spec.md#TLS-only-viewer-policy-and-HSTS-on-every-response,
>      spec: openspec/specs/static-hosting/spec.md#ACM-TLS-certificate-pinned-to-the-distribution,
>      design: §4.3, §8, §9, §12 rows 6, 7 -->

- **3.1.1** Add `modules/cloudfront-static/main.tf` declaring:
  - **Aliased provider** for `us-east-1`
    (`provider "aws" "us_east_1" { alias = "us_east_1" region =
    "us-east-1" }`) — required because CloudFront's ACM cert must live
    in `us-east-1` per design §12 row 7.
  - `resource "aws_acm_certificate" "main"` with `validation_method =
    "DNS"`, `domain_name = var.acm_domain_name` (=
    `<dev-domain>`), `subject_alternative_names = ["www.<dev-domain>"]`,
    and `provider = aws.us_east_1`. Expose the validation CNAMEs as an
    output for `modules/route53-zone` to consume in S4 (count-gated by
    `var.create_route53_records` defaulting to `false`).
  - `resource "aws_cloudfront_response_headers_policy" "security"`
    with the three nested security-header blocks —
    `strict_transport_security`, `content_type_options`,
    `referrer_policy` — **inside a single `security_headers_config {
    ... }` wrapper** per design §8 (round-2 CRITICAL-1 fix). HSTS:
    `override = true, include_subdomains = true, preload = true,
    access_control_max_age_sec = 31536000`. Nosniff:
    `override = true`. Referrer-Policy:
    `override = true, referrer_policy =
    "strict-origin-when-cross-origin"`.
  - `resource "aws_cloudfront_distribution" "this"` with:
    - `origin { domain_name = var.s3_bucket_domain_name,
      origin_id = "s3-static-site", origin_access_control_id =
      var.oac_id }` — referencing the OAC by ID, **not** an OAI
      canonical user ID.
    - `default_cache_behavior` with `viewer_protocol_policy =
      "redirect-to-https"`, `cache_policy_id` =
      `"658327ea-f89d-4fab-a63d-7e88639e58f6"` (AWS-managed
      `CachingOptimized`, per design §9.2),
      `response_headers_policy_id =
      aws_cloudfront_response_headers_policy.security.id`,
      `compress = true`. Methods `["GET", "HEAD", "OPTIONS"]`.
    - `ordered_cache_behavior` with `path_pattern = "*.html"`,
      `target_origin_id = "s3-static-site"`,
      `viewer_protocol_policy = "redirect-to-https"`, methods
      `["GET", "HEAD"]`, `compress = true`, **TTL block
      `default_ttl = 300, min_ttl = 0, max_ttl = 300`** per design
      §9.1, and the same response-headers-policy.
    - `viewer_certificate { acm_certificate_arn =
      aws_acm_certificate.main.arn, ssl_support_method = "sni-only",
      minimum_protocol_version = "TLSv1.2_2021",
      cloudfront_default_certificate = false }`.
    - `http_version = "http2and3"`, `price_class =
    var.price_class` (default `PriceClass_100`),
    `enabled = true`.
  - `resource "aws_s3_bucket_policy" "oac_only"` — **THIS is the
    policy that was deferred from S2 (per design §4.2 Option A)** —
    with JSON shaped: `Version=2012-10-17`,
    `Statement = [{ Sid = "OACOnly", Effect = "Allow", Principal =
    { Service = "cloudfront.amazonaws.com" }, Action = "s3:GetObject",
    Resource = "${var.s3_bucket_arn}/*", Condition = {
    StringEquals = { "AWS:SourceArn" =
    aws_cloudfront_distribution.this.arn } } }]`. The `Condition`
    binds the allow to the distribution just created.
- **3.1.2** Add `modules/cloudfront-static/variables.tf` declaring
  `s3_bucket_arn`, `s3_bucket_domain_name`, `oac_id`,
  `acm_domain_name`, `price_class`, `name_prefix`, AND
  `create_route53_records` (default `false`).
- **3.1.3** Add `modules/cloudfront-static/outputs.tf` exposing
  `distribution_id`, `distribution_domain_name`,
  `distribution_hosted_zone_id` (= `Z2FDTNDATAQYW2`),
  `acm_certificate_arn`, and `acm_validation_cname_records`.
- **3.1.4** Modify `envs/dev/main.tf` to compose `module
  "cloudfront_static"` and pass `name_prefix = var.name_prefix`,
  `s3_bucket_arn = module.s3_static_site.bucket_arn`, etc.
- **3.1.5** Modify `envs/dev/variables.tf` to add `acm_domain_name`
  (= `<dev-domain>` from Phase 0) and `price_class`.
- **Done when** `terraform -chdir=envs/dev apply` creates the
  distribution + ACM cert (cert will be `PENDING_VALIDATION` until
  S4); `aws cloudfront get-distribution-config --id <id>` shows
  `HttpVersion=http2and3` AND `ViewerCertificate.ACMCertificateArn`
  set AND origin's `OriginAccessControlId` set; `aws s3api
  get-bucket-policy --bucket <bucket>` contains
  `"AWS:SourceArn"` matching the distribution ARN.

### 3.2 — S3 green verify (native CloudFront domain — NO custom domain yet)

> <!-- design: §4.0 deviation #1, §13 verify rows 6, 7, 9, 10, 11, 21, 22 -->

- **3.2.1** Inject a test object `aws s3 cp index.html s3://<bucket>/index.html`
  (use one of the existing `burger-site-draft/index.html` bytes — the
  app repo copy; app-repo boundary does not apply, this is the AWS
  bucket).
- **3.2.2** Run `curl -sI -H "Accept-Encoding: br" https://<native-cloudfront-domain>/index.html`
  → must show `HTTP/2 200` AND `content-encoding: br` AND
  `vary: accept-encoding` (verify rows 10, 22 — proves Brotli via the
  S3-end distribution).
- **3.2.3** Run `curl -I https://<native-cloudfront-domain>/index.html`
  → must show `Strict-Transport-Security: max-age=31536000;
  includeSubDomains; preload` (verify row 6).
- **3.2.4** Run `curl -I http://<native-cloudfront-domain>/`
  → must show 301/302 with `Location: https://<native-cloudfront-domain>/`
  (verify row 7).
- **3.2.5** Run `aws cloudfront get-distribution-config --id <id>` →
  inspect `DefaultCacheBehavior.ViewerProtocolPolicy` ==
  `redirect-to-https` (verify row 21).
- **Done when** all four checks return the expected results; the
  custom-domain smoke test (`https://<dev-domain>`) is deferred to
  S4 verify, per design §4.0 deviation #1.

---

## Phase 4 — Slice S4: Route53 + DNSSEC

> **Spec contracts**: `static-hosting/Route53 DNSSEC enabled before
> traffic is served`.
> **Design**: §4.4, verify rows 8, 11, 24, 25.
> **Line budget**: ~200 lines.
> **Status**: blocked by Phase 0 (0.1, 0.2, 0.4 resolved before S4
  starts) and by S3.2 (CloudFront + ACM exist).

### 4.1 — Re-check Phase 0 blockers

> <!-- BLOCKED-UNTIL: 0.1, 0.2, 0.4 -->

- **4.1.1** Confirm `decisions.md` has all four Phase 0 headings
  populated (dev domain, scope, infra-repo org, final project name)
  AND the bootstrap resource values from S1.
- **4.1.2** If any heading is empty, the orchestrator re-asks the user
  via the ask-on-risk gate before S4 work begins.
- **Done when** `decisions.md` is fully populated; no Phase 0 heading
  reads `TBD — pending Phase 0`.

### 4.2 — `modules/route53-zone` HCL

> <!-- spec: openspec/specs/static-hosting/spec.md#Route53-DNSSEC-enabled-before-traffic-is-served,
>      design: §4.4, verify rows 8, 11, 24, 25 -->

- **4.2.1** Add `modules/route53-zone/main.tf` declaring:
  - `resource "aws_route53_zone" "this"` with `name =
    var.zone_name`.
  - `aws_kms_key` (CUSTOMER-managed, `Description = "DNSSEC KSK for
    ${var.zone_name}"`, `CustomerMasterKeySpec = "ECC_NIST_P256"`
    per AWS recommendation for DNSSEC KSKs). `enable_key_rotation =
    true`. Aliases / grants the Route53 service principal access.
  - `resource "aws_route53_key_signing_key" "this"` with
    `name = var.zone_name, hosted_zone_id =
    aws_route53_zone.this.zone_id, key_management_service_arn =
    aws_kms_key.this.arn, status = "ACTIVE"`.
  - `resource "aws_route53_hosted_zone_dnssec" "this"` with
    `hosted_zone_id = aws_route53_zone.this.zone_id` — flips the
    zone's DNSSEC status to `SIGNING`.
  - `resource "aws_route53_record" "alias_a"` and `alias_aaaa` for
    `<dev-domain>` → alias to
    `var.cloudfront_distribution_domain_name` with
    `zone_id = var.cloudfront_hosted_zone_id` (= the static
    `Z2FDTNDATAQYW2` from S3's output).
- **4.2.2** Add `resource "aws_route53_record" "acm_validation"` —
  `for_each = { for o in module.cloudfront_static.acm_validation_cname_records
  : o.name => o }`, with `name = each.value.name`, `type =
  each.value.type`, `records = [each.value.value]`, `ttl = 60`.
  These satisfy the DNS-validated ACM cert created in S3 and flip it
  from `PENDING_VALIDATION` to `ISSUED`.
- **4.2.3** Add `modules/route53-zone/variables.tf` declaring
  `zone_name`, `cloudfront_distribution_domain_name`,
  `cloudfront_hosted_zone_id`.
- **4.2.4** Add `modules/route53-zone/outputs.tf` exposing `zone_id`,
  `name_servers`, `dnssec_kms_key_arn`, and `dnssec_ds_record` (the
  DS record to publish at the registrar).
- **4.2.5** Modify `envs/dev/main.tf` to compose `module
  "route53_zone"` with `zone_name = var.zone_name`,
  `cloudfront_distribution_domain_name =
  module.cloudfront_static.distribution_domain_name`,
  `cloudfront_hosted_zone_id =
  module.cloudfront_static.distribution_hosted_zone_id`.
- **4.2.6** Modify `envs/dev/variables.tf` to add `zone_name` from
  Phase 0. Modify `envs/dev/outputs.tf` to expose
  `hosted_zone_name_servers` and `dnssec_ds_record`.
- **Done when** `terraform -chdir=envs/dev apply` creates the zone,
  KSK, KSK-signing, and alias records; `aws route53 get-hosted-zone
  --id <zone-id>` shows `DNSSEC.Status = SIGNING` AND a non-empty
  `KeySigningKey` block; `aws acm describe-certificate
  --certificate-arn <arn>` returns `Status = ISSUED`; `aws kms
  describe-key --key-id <ksk-arn>` returns `KeyManager = CUSTOMER`
  (verify row 25).

### 4.3 — Custom-domain smoke test

> <!-- design: §13 verify rows 8, 11, 24 -->

- **4.3.1** Confirm DNS has propagated for the new zone:
  `dig <dev-domain>` → returns the CloudFront alias target.
- **4.3.2** Confirm `dig +dnssec <dev-domain>` → the DNS header
  includes the `ad` flag (only present AFTER the registrar's DS
  record is published — see 4.4). The `RRSIG` record will also appear
  in the answer section.
- **4.3.3** Run `curl -I https://<dev-domain>` → must return `200`
  AND `Strict-Transport-Security: max-age=31536000;
  includeSubDomains; preload` (verify row 11).
- **4.3.4** Run `aws acm list-certificates --region us-east-1 --query
  "CertificateSummaryList[?contains(SubjectAlternativeName,
  '<dev-domain>')]"` → non-empty (verify row 24).
- **Done when** all four checks return the expected results.

### 4.4 — README "Bootstrap" registrar procedure

> <!-- spec: openspec/specs/iac-repo/spec.md#README-has-a-Bootstrap-a-new-environment-procedure,
>      design: §4.4 -->

- **4.4.1** Update the `## Bootstrap a new environment` section of
  `jochos-epw-infra/README.md` with the registrar-side step: "After
  `terraform apply` creates the hosted zone, retrieve the DS record
  from the apply output (or `dig DS <dev-domain>` against the AWS
  name servers) and add it to the parent zone in the registrar's
  control panel. Until this step completes, `dig +dnssec <dev-domain>`
  will not show the `ad` flag."
- **4.4.2** Document the registrar's expected location for the DS
  record (e.g., Namecheap → Advanced DNS → Add custom DNSSEC record;
  Cloudflare Registrar → DNS → DNSSEC). One sentence is enough; the
  user updates this with their specific registrar's UI if it drifts.
- **Done when** the README section has the registrar procedure AND a
  user reading this section can complete the step without external
  context.

### 4.5 — S4 green verify

> <!-- design: §13 verify rows 8, 11, 24, 25 -->

- **4.5.1** Run the verify commands from 4.2 and 4.3 above.
- **4.5.2** Confirm no Route53 record in the new zone contains the
  substring `supabase`:
  `aws route53 list-resource-record-sets --hosted-zone-id <zone-id>
  --query 'ResourceRecordSets[?contains(to_lower(Name),
  \`supabase\`)]'` → empty (verify row 19).
- **Done when** all checks pass; the orchestrator records
  `## Slice S4 — green` in `decisions.md`.

---

## Phase 5 — Slice S5: deploy automation

> **Spec contracts**:
> `iac-repo/App-repo deploy workflow consumes infra via OIDC`,
> `static-hosting/OIDC-based deploys, no long-lived AWS keys`,
> `static-hosting/Per-deploy invalidation batching with
> DISABLE_INVALIDATION opt-out`.
> **Design**: §3, §4.5, §5, §6, §12 rows 8, 9, 10, 11, 13, verify
> rows 12–16, 20.
> **Line budget**: ~150 lines.
> **Status**: blocked by S4.5 (dev domain live with TLS).

### 5.1 — Infra-repo CI OIDC trust (NEW — round-2 SUGGESTION-1)

> <!-- design: §12 row 8, verify row 14, 30 -->

- **5.1.1** Add `modules/iam-deploy-role/main.tf` with TWO
  `aws_iam_role` blocks — one for the **app-repo deploy** (existing
  design §6) and one for the **infra-repo CI** (per design §12 row 8
  / cross-cutting note: this is added scope, surfaced here as a
  tracked line item because the proposal did not enumerate it).
- **5.1.2** The infra-repo CI trust scopes to
  `repo:<infra-repo-org>/jochosepw-infra:ref:refs/heads/main`
  (single-branch), with a read-only inline policy (state read +
  plan-level actions only — NO `cloudfront:CreateInvalidation`, NO
  `s3:PutObject`).
- **Done when** the trust policy JSON is committed to
  `modules/iam-deploy-role/`; the orchestrator verifies the two
  roles are distinct (different `AssumeRolePolicyDocument` ARN).

### 5.2 — App-repo deploy workflow

> <!-- spec: openspec/specs/iac-repo/spec.md#App-repo-deploy-workflow-consumes-infra-via-OIDC,
>      spec: openspec/specs/static-hosting/spec.md#OIDC-based-deploys-no-long-lived-AWS-keys,
>      spec: openspec/specs/static-hosting/spec.md#Per-deploy-invalidation-batching-with-DISABLE_INVALIDATION-opt-out,
>      design: §3, §4.5, §12 rows 8, 9, 10, 11 -->

- **5.2.1** Add `.github/workflows/deploy.yml` to the app repo
  `jochos-epw` per design §3 — triggers:
  - `push.branches: [main]` with a `paths:` filter on
    `burger-site-draft/**` AND `.github/workflows/deploy.yml`
    (per design §12 row 10 — a docs-only PR must not apply Terraform);
  - `workflow_dispatch` with an optional `disable_invalidation`
    boolean input.
- **5.2.2** Permissions:
  `permissions: id-token: write, contents: read` (per design §3).
  **No `secrets:` block — no long-lived AWS keys exist anywhere.**
  Concurrency: `group: deploy-dev, cancel-in-progress: false` per
  design §12 row 11.
- **5.2.3** Steps in order (per design §3):
  - `actions/checkout@v4` of the app repo.
  - `Restore supabase-config.js` step (per design §3 + §12 row 9 +
    5.3 below).
  - `Normalize DISABLE_INVALIDATION` step — reads
    `vars.DISABLE_INVALIDATION || ''` and the `workflow_dispatch`
    input, ORs them, and exports `DISABLE_INVALIDATION=true|false`
    via `$GITHUB_ENV`. Downstream steps MUST branch on strict
    string equality, NOT JS-truthy logic (round-2 SUGGESTION-3).
  - `aws-actions/configure-aws-credentials@v4` with
    `role-to-assume: ${{ env.DEV_DEPLOY_ROLE_ARN }}` (this is the
    OIDC trust from 5.1's app-repo-deploy role).
  - `hashicorp/setup-terraform@v3` with `terraform_version =
    ${{ env.TERRAFORM_VERSION }}`.
  - `Checkout infra repo at pinned ref` — `git init`, `git remote add
    origin "https://github.com/${INFRA_REPO}.git"`, `git fetch --depth 1
    origin "$INFRA_REF"`, `git checkout FETCH_HEAD` (uses
    `vars.INFRA_REPO` and `vars.INFRA_REF`).
  - `terraform -chdir=infra/envs/dev init -input=false` (with state
    backend pointing at the bootstrap bucket from S1).
  - `terraform -chdir=infra/envs/dev apply -auto-approve -input=false`.
  - `aws s3 sync` of the four HTML files + `supabase-config.js` with
    `--cache-control "public, max-age=300"` and explicit
    `--include` filters (per design §3).
  - `aws cloudfront create-invalidation --paths` for the changed
    files, **gated by `if: env.DISABLE_INVALIDATION != 'true'`**.
  - A no-op `CloudFront invalidation suppressed` echo step gated by
    `if: env.DISABLE_INVALIDATION == 'true'` so the workflow log
    clearly names the opt-out.
- **5.2.4** Repo variables required (set in
  `jochos-epw → Settings → Variables → Actions`): `AWS_REGION`,
  `TERRAFORM_VERSION`, `INFRA_REPO`, `INFRA_REF`,
  `DEV_DEPLOY_ROLE_ARN`, `DEV_BUCKET`, `DEV_DISTRIBUTION_ID`,
  `SUPABASE_CONFIG_SRC`, `DISABLE_INVALIDATION`.
- **Done when** `git -C jocho s-epw find . -name "*.tf"` returns empty
  (verify row 17 — app repo has no Terraform resource definitions);
  the workflow file is the ONLY `.github/workflows/deploy.yml` in the
  app repo (verify row 30).

### 5.3 — `supabase-config.js` guard

> <!-- design: §3 + §12 row 9 + risk §14 #7 -->

- **5.3.1** Inside the deploy workflow, the `Restore supabase-config.js`
  step (5.2.3) is the production guard:
  ```bash
  if [ ! -f "$SUPABASE_CONFIG_SRC" ]; then
    echo "::error::supabase-config.js is missing. It is gitignored —
  restore from the team's secure store before deploying."
    exit 1
  fi
  ```
- **5.3.2** The step is the FIRST thing the workflow does that touches
  a deploy-time file, so a missing file fails fast without invoking
  Terraform.
- **Done when** the gate is present in the workflow AND a test
  workflow run with the file deleted exits non-zero at this step.

### 5.4 — S5 green verify (end-to-end)

> <!-- design: §13 verify rows 12–16, 20 -->

- **5.4.1** Run `gh secret list` in both `jochos-epw` and
  `jochos-epw-infra` → neither returns any secret whose name starts
  with `AWS_ACCESS_KEY`, `AWS_SECRET`, `AWS_SESSION_TOKEN`, nor any
  value beginning with `AKIA`. (verify row 12)
- **5.4.2** Run `aws iam simulate-principal-policy
  --policy-source-arn <deploy-role-arn>
  --action-names s3:DeleteBucket s3:PutBucketPolicy
  cloudfront:CreateDistribution iam:PassRole` → every result MUST be
  `implicitDeny` or `explicitDeny`. None `allowed`. (verify row 13)
- **5.4.3** Modify one character in
  `burger-site-draft/index.html` on a branch → PR → merge to `main`
  → workflow runs → `curl -s https://<dev-domain>/index.html` shows
  the new byte within **5 minutes** (per design §4.0 deviation #2;
  HTML TTL 300s + invalidation propagation). (verify row 20)
- **5.4.4** Confirm `aws cloudfront list-invalidations --distribution-id
  <id>` shows exactly one new invalidation in the last ten minutes
  (verify row 15 — single batch).
- **5.4.5** Set `vars.DISABLE_INVALIDATION=true`, repeat 5.4.3 → the
  workflow log MUST show the "invalidation suppressed via
  DISABLE_INVALIDATION" line AND no
  `aws cloudfront create-invalidation` call. (verify row 16)
- **5.4.6** Decode the OIDC token used by the assumeRole → `sub`
  claim matches `repo:<app-repo-org>/jochos-epw:ref:refs/heads/main`
  (verify row 14). Easiest method: `gh api --header 'Accept:
  application/vnd.github+json' /repos/<app-repo-org>/jochos-epw/actions/`
  runners/jobs, then inspect the configure-aws-credentials step's
  token.
- **5.4.7** Confirm in `decisions.md` and a CI matrix that the
  end-to-end deploy (5.4.3) completes in under 5 minutes (verify row
  20 timing).
- **Done when** all six checks pass; the orchestrator records
  `## Slice S5 — green` in `decisions.md`.

---

## Phase 6 — Slice S6 (OPTIONAL): prod environment

> **Spec contracts**:
> `iac-repo/Repository layout` (prod is out-of-scope),
> `static-hosting/Supabase boundary`.
> **Design**: §4.6.
> **Line budget**: ~250 lines.
> **Status**: ENTIRELY OPTIONAL. Only start Phase 6 after Phase 5 has
> been merged + stable for one cycle (typically one to two weeks),
> AND the user has confirmed that prod is needed.

### 6.1 — Defer this slice

- **6.1.1** Confirm `decisions.md` records that prod is needed (or
  that this slice was explicitly rejected).
- **6.1.2** Re-affirm the 400-line review budget applies to the prod
  PR (do not bulk-combine prod with a separate change).
- **Done when** the user (or orchestrator on user behalf) gives an
  explicit go for Phase 6 to start; record in `decisions.md`.

### 6.2 — `envs/prod/` directory

> <!-- design: §4.6, verify rows 17, 18 -->

- **6.2.1** Add `envs/prod/{main,variables,outputs,remote-backend}.tf`
  mirroring `envs/dev/` with `name_prefix = "<final-project-name>-prod"`
  and `bucket_name = "<final-project-name>-static-prod"` (still
  validated against the `supabase` substring).
- **6.2.2** `remote-backend.tf` uses state key
  `<final-project-name>/prod/terraform.tfstate` against the same
  bootstrap state bucket + lock table.
- **Done when** `terraform -chdir=envs/prod init` succeeds with a
  separate state key; `tfplan.tfstate` key is distinct from the dev
  key (verify by inspecting the S3 state bucket listing).

### 6.3 — Prod deploy role + workflow

> <!-- design: §4.6, §12 row 8 -->

- **6.3.1** Add a third OIDC trust for a `ProdDeployRole`, scoped to
  `repo:<app-repo-org>/jochos-epw:ref:refs/heads/release/*` (NOT
  `main`). Per design §4.6, prod deploy is **manual** —
  `workflow_dispatch` only — never auto-deploys on a `push` to
  `main`.
- **6.3.2** Add `jochos-epw/.github/workflows/deploy-prod.yml` as a
  clone of `deploy.yml` with `DEV_*` vars renamed `PROD_*` and the
  trigger restricted to `workflow_dispatch`.
- **Done when** `gh workflow run deploy-prod.yml` from a
  `release/v0.1.0` branch succeeds; the `prod` deploy role's
  `simulate-principal-policy` returns `implicitDeny` for the dev
  bucket ARN.

### 6.4 — S6 green verify

> <!-- design: §13 verify matrix (re-run against prod) -->

- **6.4.1** Re-run the verify matrix from S2–S5 against the prod
  domain and prod bucket, with `<prod-domain>` substituted.
- **6.4.2** Run `aws route53 list-resource-record-sets` for both
  hosted zones → confirm dev and prod are in separate hosted zones.
- **Done when** both checks pass; the orchestrator records
  `## Slice S6 — green` in `decisions.md`.

---

## Conventions applied to every task

| Field | Convention | Rationale |
|---|---|---|
| Verb | Imperative led (Add, Create, Verify, Record, Resolve, Confirm) | Reviewer parses intent fast |
| Target | File path OR AWS resource OR decision doc | Concrete, not abstract |
| Done when | Observable (CLI exit code, AWS CLI output, `gh` output, `decisions.md` heading populated) | Eliminates "looks done" ambiguity |
| BLOCKED-UNTIL | HTML comment naming the blocker task | Orchestrator / apply agent reads these |
| Spec link | HTML comment naming the spec requirement + design §4 slice | One click → which requirement this is satisfying |
| Numbering | `1.`, `1.1`, `1.2`, ... per phase; `1.1.1` only if subtask has 3+ sub-steps | `rules.tasks` verbatim |
| Build pipeline | None | `rules.tasks` verbatim — every task is shell + `aws` + `gh` |
| Slice grouping | Tasks under slice subheadings (not under verify rows) | Reviewer reads the slice flow, not the verify matrix |

## Risks and carry-overs (designer-discovered)

1. **`infra-repo CI OIDC trust` is added scope** (round-2
   SUGGESTION-1, surfaced as 5.1.1). Apply phase should confirm this is
   in scope before starting S5.
2. **`supabase-config.js` recovery from the gitignored state** is a
   known MVP limitation (design §12 row 9 / risk §14 #7). 5.3 gate
   fails loudly; the production-grade fix (GitHub Actions secret
   provisioned out-of-band) is documented as a follow-up change
   tracker, not in this one.
3. **`DISABLE_INVALIDATION` truthiness logic** is normalized via a
   dedicated step (5.2.3) per round-2 SUGGESTION-3. The normalized env
   var holds the literal string `"true"` or `"false"` and downstream
   steps use strict equality — never JS-truthy `||` / `&&` in
   `${{ }}`.
4. **400-line review budget is binding** (design §14 risk #6). Each
   slice has a budget in its phase header. If a slice balloons, it
   splits — the orchestrator surfaces this to the user.
5. **Two concurrent deploys race on state lock** (design §14 risk
   #8). `concurrency: group: deploy-dev, cancel-in-progress: false`
   in 5.2.2 + DynamoDB lock as the backstop.

## Next step

`sdd-verify` — execute the verify commands from each slice's "Done
when" + design §13 against the live dev AWS account. Confirm all five
slices (S1–S5) are green before the orchestrator marks this change as
shippable. S6 is verified separately if Phase 6 is started.
