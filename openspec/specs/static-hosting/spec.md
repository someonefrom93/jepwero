# Static Hosting Spec

> SDD capability: `static-hosting` — AWS-hosted static-site topology for the
> existing `burger-site-draft/` frontend (four HTML files + `supabase-config.js`).
> Supabase backend stays at `https://ouhwfkxqpxikqhwcqioc.supabase.co` and is
> explicitly out of scope. Authored from the `aws-static-hosting` proposal.

## Purpose

`static-hosting` exposes the local `burger-site-draft/` files on a public,
TLS-only URL behind CloudFront, with S3 as a private origin, Route53 as the
authoritative DNS, and ACM pinning the TLS certificate to the distribution.
The capability covers the runtime path (user → DNS → edge → S3) and the
deployment invariants (OIDC deploy role, OAC-only ingress, batched
invalidation). The hosting surface MUST be reachable over HTTPS, MUST NOT
expose the S3 bucket to the public internet under any circumstance, and MUST
be deployable from a merge to `main` in the app repo without anyone handling
long-lived AWS keys.

## Requirements

### Requirement: S3 bucket privacy and ingress control

The S3 bucket holding the static assets MUST be private. `BlockPublicAccess`
MUST be set to `on` for **all four** flags
(`block_public_acls`, `ignore_public_acls`, `block_public_policy`,
`restrict_public_buckets`). The bucket MUST NOT have a public bucket policy
and MUST NOT have a public website endpoint. CloudFront — via the Origin
Access Control (OAC) defined below — MUST be the only ingress to the bucket.
No deployment that exposes the bucket via a public list, a public policy, a
website endpoint, or a non-OAC CloudFront origin MAY be accepted as green by
the apply or verify phase.

#### Scenario: S3 BlockPublicAccess is on for all four flags

- Given the S3 bucket exists in the dev AWS account
- When `aws s3api get-public-access-block --bucket <dev-bucket>` is run
- Then the response MUST show `BlockPublicAcls=true`,
  `IgnorePublicAcls=true`, `BlockPublicPolicy=true`, AND
  `RestrictPublicBuckets=true`
- And `aws s3api get-bucket-policy-status --bucket <dev-bucket>` MUST return
  `IsPublic: false`

#### Scenario: unauthenticated direct GET against the bucket is rejected

- Given the bucket has `BlockPublicAccess` on for all four flags and an
  OAC-restricted bucket policy
- When a curl request is issued to
  `https://<dev-bucket>.s3.amazonaws.com/index.html` without AWS credentials
- Then the response MUST be `403 AccessDenied`
- And the response body MUST NOT contain any of the bucket's object bytes

#### Scenario: OAC service principal is the only allowed bucket ingress

- Given the bucket policy exists
- When the policy JSON is inspected
- Then the `Principal` of every `Allow` statement MUST be
  `cloudfront.amazonaws.com` constrained by a `Condition` referencing the
  CloudFront distribution ARN
- And no `Allow` statement MAY have `Principal: "*"` or
  `Principal: { AWS: "*" }`

### Requirement: CloudFront uses Origin Access Control (OAC)

The CloudFront distribution MUST use **Origin Access Control (OAC)** to sign
requests to the S3 origin. **OAI (Origin Access Identity) is FORBIDDEN** —
OAI is legacy and AWS-deprecated. Any apply or verify step that produces a
distribution using OAI MUST fail. OAC MUST be configured with
`signing-behavior = "always"` and `signing-protocol = "sigv4"`, and the
distribution's origin MUST reference the OAC by its ID (not by an OAI
canonical user ID).

#### Scenario: distribution origin references an OAC, not an OAI

- Given the CloudFront distribution exists
- When `terraform state show` (or `aws cloudfront get-distribution`) is
  inspected for the origin configuration
- Then the origin MUST have a `origin_access_control_id` set
- And the origin MUST NOT have a `s3_origin_config` block with a populated
  `origin_access_identity` field
- And no `aws_cloudfront_origin_access_identity` resource MAY exist in the
  Terraform state for this stack

#### Scenario: OAC signing behaviour is always + SigV4

- Given the OAC resource exists
- When `aws cloudfront get-origin-access-control` is run for that OAC
- Then `SigningBehavior` MUST equal `always`
- And `SigningProtocol` MUST equal `sigv4`

#### Scenario: apply or verify that uses OAI is rejected

- Given a candidate configuration that defines an
  `aws_cloudfront_origin_access_identity` resource and points a CloudFront
  origin at it
- When the apply or verify step runs
- Then the step MUST fail with an error message that names OAI as forbidden
  and points to OAC as the required control
- And no CloudFront distribution MAY be created or updated in that step

### Requirement: TLS-only viewer policy and HSTS on every response

The CloudFront distribution's `default_cache_behavior.viewer_protocol_policy`
MUST be `redirect-to-https`. The distribution MUST attach a response-headers
policy that adds `Strict-Transport-Security` on every response served at the
edge, with `max-age` of at least 31536000 seconds (one year),
`includeSubDomains`, and `preload`. The HSTS header MUST be present on
successful responses (HTTP 200) AND on redirects (HTTP 301/302) produced by
the redirect-to-https policy.

#### Scenario: HTTP request to the dev domain redirects to HTTPS

- Given the dev distribution is deployed and the dev domain resolves to it
- When `curl -I http://<dev-domain>/` is run
- Then the response MUST be `301` or `302`
- And the `Location` header MUST be the `https://<dev-domain>/` equivalent
  of the requested path
- And the response MUST NOT serve any body bytes

#### Scenario: HTTPS response carries HSTS

- Given the dev distribution is deployed
- When `curl -I https://<dev-domain>/` is run
- Then the response MUST be `200` (or `403` for paths the OAC denies, but
  `200` for the index path)
- And the response MUST include `Strict-Transport-Security: max-age=31536000;
  includeSubDomains; preload`

#### Scenario: viewer-protocol-policy is redirect-to-https

- Given the CloudFront distribution exists
- When its default cache behavior is inspected
- Then `ViewerProtocolPolicy` MUST equal `redirect-to-https`
- And it MUST NOT equal `allow-all` or `https-only`

### Requirement: ACM TLS certificate pinned to the distribution

The TLS certificate MUST be issued by AWS Certificate Manager (ACM) and MUST
be validated via DNS (DNS-validated certificate, not email-validated). The
certificate MUST be attached to the CloudFront distribution as its
`viewer_certificate` and MUST cover the dev domain. ACM certificates used by
CloudFront MUST live in the `us-east-1` region regardless of the rest of the
stack's region.

#### Scenario: certificate is ACM-issued, DNS-validated, in us-east-1

- Given the certificate is created
- When `aws acm get-certificate` is run
- Then the response MUST include a CertificateArn under
  `arn:aws:acm:us-east-1:<account>:certificate/<id>`
- And the certificate's `DomainValidationOptions` MUST show a `DNS` validation
  record (not `EMAIL`)
- And each `DomainValidationOptions[].ValidationStatus` MUST be `SUCCESS`
  before any CloudFront distribution is allowed to point at it

#### Scenario: CloudFront distribution references the ACM certificate

- Given the CloudFront distribution exists
- When its `ViewerCertificate` block is inspected
- Then `ACMCertificateArn` MUST be set to the certificate's ARN
- And `SSLSupportMethod` MUST be `sni-only` (or `vip`, but `sni-only` is the
  default and preferred for cost)
- And `CloudFrontDefaultCertificate` MUST be `false`
- And `MinimumProtocolVersion` MUST be `TLSv1.2_2021` or newer

#### Scenario: dev domain is in the certificate's SAN list

- Given the certificate is created for `<dev-domain>`
- When the certificate's subject alternative names are listed
- Then `<dev-domain>` MUST appear in the SAN list

### Requirement: Route53 DNSSEC enabled before traffic is served

The Route53 hosted zone for the dev domain MUST have DNSSEC enabled **before
any traffic is served** at the dev domain. The DNSSEC signing MUST be done
with a customer-managed KMS key (KMS-backed KSK). The chain of trust to the
parent zone MUST be established at the registrar, and the registrar's
DS-record configuration MUST be documented in the infra-repo README. Until
the parent zone is signed, DNSSEC MUST NOT be considered "live" for verify
purposes, but the Route53-side signing MUST be on regardless.

#### Scenario: Route53 hosted zone has DNSSEC signing enabled

- Given the hosted zone exists
- When `aws route53 get-hosted-zone` is run for the zone
- Then the response MUST include a non-empty `KeySigningKey` block
- And `DNSSEC.Status` MUST be `SIGNING` (eventually `INSECURE` is acceptable
  only if the parent chain is not yet established, but `SIGNING` is required
  for the apply phase to mark the slice green)

#### Scenario: dig +dnssec reports the authenticated-data flag

- Given DNSSEC signing is on at Route53 and the parent chain is established
- When `dig +dnssec <dev-domain>` is run from a DNSSEC-validating resolver
- Then the response MUST include the `ad` (authenticated data) flag in the
  DNS header
- And the response MUST include an `RRSIG` record in the answer section

#### Scenario: KMS key used as the KSK is customer-managed

- Given the hosted zone uses DNSSEC
- When the zone's `KeySigningKey` is inspected
- Then its `KMSKeyArn` (if present) MUST point to a customer-managed CMK
  and MUST NOT reference the AWS-managed default key

### Requirement: Cache TTLs are HTML-300s and asset-1y

The CloudFront default cache behavior MUST set the `min`, `default`, and
`max` TTL to **300 seconds** for HTML responses. The same distribution MUST
behave such that static assets (CSS, JS, image, font, etc. by `Content-Type`
or path) can be served with a TTL of **one year** (31536000 seconds). The
one-year TTL on static assets is contingent on content-hashed filenames;
this change ships the configuration that supports the one-year TTL, but the
content-hashed filenames themselves are a follow-up optimization and are NOT
a requirement of this change. Until filenames are hashed, deploys MUST
trigger a CloudFront invalidation for the changed object paths so that the
old object is not served past its 300-second window for the HTML and not at
all for the static asset.

#### Scenario: HTML responses have a 300s cache TTL

- Given the CloudFront distribution is deployed
- When `curl -I https://<dev-domain>/index.html` is run
- Then the `Cache-Control` header MUST be `max-age=300` (or contain a directive
  whose `max-age` is 300) for the HTML document responses
- And the `Age` header MUST increment over successive requests without
  invalidation, proving the edge is caching

#### Scenario: static assets can be served with a 1-year TTL

- Given a static asset (e.g. a CSS file) exists in the bucket under a
  content-hashed filename
- When `curl -I https://<dev-domain>/assets/main.<hash>.css` is run
- Then the `Cache-Control` header MUST be `max-age=31536000` for the asset
  response
- And the response MUST include the hash in the path so the filename changes
  on every content change

#### Scenario: content-hashed filenames are a follow-up, not a requirement

- Given this change is in scope
- When the apply phase ships the hosting topology
- Then the apply phase MUST NOT block on producing content-hashed filenames
- And the apply phase MUST keep `aws s3 sync` as the deploy mechanism for
  the four HTML files plus `supabase-config.js`
- And the README MUST note content-hashed filenames as a future-tense
  optimization

### Requirement: Brotli at the edge, HTTP/2 and HTTP/3 enabled

The CloudFront distribution MUST enable Brotli compression at the edge for
compressible `Content-Type` values (`text/html`, `text/css`,
`application/javascript`, `application/json`, `text/plain`, `image/svg+xml`,
and other text-based MIME types). The distribution MUST enable both HTTP/2
and HTTP/3. The `Accept-Encoding` request header MUST be honored
correctly: clients advertising `gzip` MUST get gzip, clients advertising
`br` MUST get Brotli, and clients advertising both MUST get Brotli.

#### Scenario: client advertising br gets a Brotli response

- Given the dev distribution is deployed
- When
  `curl -I -H "Accept-Encoding: br" https://<dev-domain>/index.html` is run
- Then the response MUST include `Content-Encoding: br` in the headers
- And the `Vary: Accept-Encoding` header MUST be present so cached variants
  do not collide

#### Scenario: client advertising gzip gets a gzip response

- Given the dev distribution is deployed
- When
  `curl -I -H "Accept-Encoding: gzip" https://<dev-domain>/index.html` is
  run
- Then the response MUST include `Content-Encoding: gzip` in the headers

#### Scenario: HTTP/2 and HTTP/3 are both enabled

- Given the CloudFront distribution exists
- When its `DistributionConfig` is inspected
- Then `HttpVersion` MUST include both `http2` and `http3` (i.e. the value
  MUST be `http2and3` or `http3`)
- And `HttpVersion` MUST NOT be `http1.1`

### Requirement: OIDC-based deploys, no long-lived AWS keys

The GitHub Actions workflow that deploys to AWS MUST authenticate via
**OIDC assumeRole** using a GitHub OIDC provider registered in IAM. No
long-lived AWS access key (`AWS_ACCESS_KEY_ID` +
`AWS_SECRET_ACCESS_KEY`) MAY exist in any GitHub Actions secret in either
the app repo or the infra repo. The IAM role assumed by GitHub MUST be
scoped to a **single bucket prefix** (e.g.
`arn:aws:s3:::<dev-bucket>/<prefix>/*`) and to the
`cloudfront:CreateInvalidation` action on **only the dev distribution ARN**.
The role MUST NOT allow `s3:DeleteBucket`, `s3:PutBucketPolicy`,
`cloudfront:CreateDistribution`, or any other high-privilege action.

#### Scenario: no long-lived AWS keys exist in GitHub secrets

- Given the app repo and the infra repo on GitHub
- When the repo's Actions secrets are listed (e.g. via the GitHub UI, the
  REST API, or `gh secret list`)
- Then no secret whose name starts with `AWS_ACCESS_KEY`, `AWS_SECRET`,
  `AWS_SESSION_TOKEN`, or whose value is an `AKIA`-prefixed access key MAY
  exist in either repo
- And the deploy workflow MUST use the OIDC token exchange (`aws-actions/configure-aws-credentials@v4` or equivalent)

#### Scenario: IAM role allows actions only on the dev bucket prefix

- Given the deploy role is defined in the infra repo
- When its IAM policy is inspected
- Then the policy's `Action` set MUST be a subset of
  `{s3:PutObject, s3:DeleteObject, s3:GetObject, s3:ListBucket,
  cloudfront:CreateInvalidation}`
- And every S3 resource in the policy MUST match
  `arn:aws:s3:::<dev-bucket>` (for list actions) or
  `arn:aws:s3:::<dev-bucket>/<prefix>/*` (for object actions)
- And the `cloudfront:CreateInvalidation` resource MUST equal
  `arn:aws:cloudfront::<account>:distribution/<dev-distribution-id>`

#### Scenario: simulate-principal-policy shows no extra permissions

- Given the deploy role is defined
- When
  `aws iam simulate-principal-policy --policy-source-arn <role-arn>
  --action-names s3:DeleteBucket --action-names s3:PutBucketPolicy
  --action-names cloudfront:CreateDistribution
  --action-names iam:PassRole` is run
- Then the result for each action MUST be `implicitDeny` or `explicitDeny`
- And no action in the result MAY be `allowed`

### Requirement: Per-deploy invalidation batching with DISABLE_INVALIDATION opt-out

Every deploy that mutates the bucket's object set MUST trigger **exactly one**
CloudFront invalidation that batches the changed paths. The deploy workflow
MUST support a `DISABLE_INVALIDATION` repository variable (or PR-level
opt-out) that suppresses the invalidation call. The opt-out is documented as
safe for content-only pushes because the HTML TTL is 300s and CloudFront
will pick up the new bytes within five minutes. The invalidation MUST be
the only CloudFront mutating action run by the deploy; the workflow MUST
NOT delete or replace the distribution on a content deploy.

#### Scenario: a content deploy triggers a single batched invalidation

- Given a merge to `main` in the app repo modifies `index.html`
- When the deploy workflow runs to completion
- Then exactly one `aws cloudfront create-invalidation` call MUST have been
  issued, with `Paths.Items` covering the changed paths and
  `Paths.Quantity` matching `Items` length
- And the invalidation's `DistributionId` MUST equal `<dev-distribution-id>`

#### Scenario: DISABLE_INVALIDATION=true suppresses the invalidation

- Given the `DISABLE_INVALIDATION` repository variable is set to `true`
- When a merge to `main` runs the deploy workflow
- Then `aws cloudfront create-invalidation` MUST NOT be invoked
- And the workflow log MUST show a clear "invalidation suppressed via
  DISABLE_INVALIDATION" line
- And the new object bytes MUST be served at the edge within
  `max-age=300` seconds (HTML TTL) without manual intervention

#### Scenario: deploy does not mutate the distribution itself

- Given any deploy runs
- When the workflow log is inspected
- Then no `aws cloudfront create-distribution`,
  `aws cloudfront update-distribution`, or `aws cloudfront delete-distribution`
  call MUST appear in the log
- And the only CloudFront call MUST be the (optional) `create-invalidation`

### Requirement: Supabase boundary — no DNS or naming overlap

The hosting surface MUST NOT overlap with Supabase in any of: bucket name,
domain name, or DNS records. The dev domain MUST NOT be a subdomain of
`supabase.co` or `supabase.io`, MUST NOT be `supabase.co` or `supabase.io`
itself, and MUST NOT appear in any Route53 record that points to
`*.supabase.co` or `supabase.io`. The S3 bucket name MUST NOT contain the
substring `supabase` (case-insensitive). This separation is the
contract that lets the Supabase project at
`https://ouhwfkxpxikqhwcqioc.supabase.co` continue to exist unchanged
throughout this change.

#### Scenario: dev domain is not a Supabase subdomain

- Given the dev domain is registered in Route53
- When the dev domain is compared against the suffix list
  `["supabase.co", "supabase.io"]`
- Then the dev domain MUST NOT end in any of those suffixes
- And the dev domain MUST NOT equal any of those values

#### Scenario: no Route53 record points at Supabase

- Given the Route53 hosted zone exists for the dev domain
- When `aws route53 list-resource-record-sets` is run for the zone
- Then no record's value (after alias resolution) MAY end in
  `supabase.co` or `supabase.io`
- And no record's value MAY be a Supabase-provided URL

#### Scenario: bucket name does not contain the substring "supabase"

- Given the S3 bucket is created
- When the bucket name is normalized to lowercase
- Then the result MUST NOT contain the substring `supabase`

## Out of scope

- Migrating Supabase to AWS. The Supabase project at
  `https://ouhwfkxpxikqhwcqioc.supabase.co` stays exactly as it is.
- Adding a build step, bundler, framework, or package manager to the app
  repo. Deployment is `aws s3 sync` of four HTML files plus
  `supabase-config.js`.
- WAFv2 managed rule groups (deferred until traffic warrants the cost).
- Lambda@Edge or CloudFront Functions for URL rewrites.
- Multi-region failover or Route53 health checks.
- AWS Secrets Manager (Supabase keys are gated outside git in
  `supabase-config.js`).
- DNS for the Supabase project itself.
- The `prod` environment — same module will support it later, but only
  `dev` is wired in this change.
- Editing any file inside `burger-site-draft/`. The app code is frozen
  during the infra bootstrap.
- Content-hashed filenames for static assets (follow-up optimization; the
  1-year asset TTL is in place but unused until filenames are hashed).

## Dependencies

- An AWS account with permission to create S3 buckets, CloudFront
  distributions, ACM certificates, Route53 hosted zones, IAM roles, and
  OIDC providers.
- A Route53-registered domain (the dev domain is currently a placeholder
  — see the carry-over appendix).
- The `iac-repo` capability (sibling repo `jochos-epw-infra`) which
  defines the Terraform modules, state backend, and CI workflows that
  this capability's resources are described by.
- The app repo `jochos-epw` whose `burger-site-draft/` files are the
  source of truth for the four HTML pages and `supabase-config.js`.

## Carry-over open questions

These are NOT requirements and they do NOT block this spec. They are
risks for the apply phase and SHOULD be resolved before S4 (Route53 +
DNSSEC) lands.

1. **Domain name** — the orchestrator-side decision needed before S4. The
   dev domain is a placeholder `<dev-domain>` in this spec; suggest
   `dev.jochosepw.com` (or similar) under a new Route53 zone, with the
   apex reserved for the eventual `prod` slice. Confirm before S4.
2. **Dev-only OK** — yes for this change. The `prod` environment is a
   follow-up slice (S6 in the proposal) and is not in scope here.
3. **Infra-repo org placement** — `<infra-repo-org>` is a placeholder. The
   new `jochos-epw-infra` repo is scaffolded as a sibling; final GitHub
   org placement is decided at apply time.
4. **Project rename** — `jochos-epw` is the current working name per
   `openspec/config.yaml` ("working name; subject to rename during
   proposal phase"). If a rename is happening, the bucket name and
   domain choice should reflect the final name. Surface the final name
   before S2 (S3 bucket creation) lands to avoid rename churn mid-deploy.
