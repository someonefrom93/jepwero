# `aws-static-hosting` — Spec (change-level wrapper)

> SDD spec phase for change `aws-static-hosting`. This file is a thin
> wrapper inside the change directory. The full capability specs live
> under `openspec/specs/`. Authored from the
> `aws-static-hosting` proposal.

## Purpose

Capture the requirements and Given/When/Then scenarios that prove each
decision in the `aws-static-hosting` proposal. This change adds two
**new** capabilities and modifies **zero** existing capabilities.

## Capabilities delta'd

### New

- `static-hosting` — see [`openspec/specs/static-hosting/spec.md`](../../specs/static-hosting/spec.md).
  AWS-hosted static-site topology (S3 private + OAC + CloudFront with
  TLS / HSTS / Brotli / HTTP/2+3 + Route53 with DNSSEC + ACM DNS-validated
  cert pinned to the distribution). Captures S3 privacy, OAC-only
  ingress, TLS-only viewer policy with HSTS, ACM pinning, Route53
  DNSSEC, cache TTLs (HTML 300s, asset 1y with content-hashed
  filenames as a follow-up), Brotli + HTTP/2 + HTTP/3, OIDC assumeRole
  deploys, per-deploy invalidation batching with `DISABLE_INVALIDATION`
  opt-out, and the Supabase boundary (no DNS or naming overlap).

- `iac-repo` — see [`openspec/specs/iac-repo/spec.md`](../../specs/iac-repo/spec.md).
  Separate `jochos-epw-infra` repo holding Terraform modules + per-env
  directories. Remote state in S3 with DynamoDB lock (no local state;
  state bucket has its own BlockPublicAccess + lifecycle). Plan-only CI
  on every PR against the infra repo with manual approval to apply.
  App-repo deploy workflow consumes infra via OIDC, syncs the four
  HTML files + `supabase-config.js` to the dev bucket, and triggers a
  CloudFront invalidation on merge to `main`. Infra-repo README covers
  prerequisites, bootstrap-a-new-env, rotate-state, and roll-back-a-deploy.
  Boundary between app repo and infra repo is enforced by workflow
  design.

### Modified

- None. No existing OpenSpec capability is touched. App code in
  `burger-site-draft/` is frozen during this change; only the hosting
  surface is added.

## Out of scope for this change

- Migrating Supabase to AWS. Supabase stays at
  `https://ouhwfkxpxikqhwcqioc.supabase.co` exactly as it is.
- Adding a build step, bundler, framework, or package manager to the
  app repo. Deployment is `aws s3 sync` of four HTML files plus
  `supabase-config.js`.
- WAFv2 managed rule groups (deferred until traffic warrants the
  cost).
- Lambda@Edge or CloudFront Functions for URL rewrites (deferred;
  vanilla HTML needs no rewriting today).
- Multi-region failover or Route53 health checks.
- AWS Secrets Manager (Supabase keys are gated outside git in
  `supabase-config.js`).
- DNS for the Supabase project itself.
- The `prod` environment — same module will support it, but only
  `dev` is wired in this change; a second env is the natural
  follow-up slice.
- Any changes to files inside `burger-site-draft/`. App code stays
  frozen during infra bootstrap.
- Content-hashed filenames for static assets (follow-up optimization;
  the 1-year asset TTL is in place but unused until filenames are
  hashed).

## Carry-over open questions

These are NOT requirements and they do NOT block this spec. They are
risks for the apply phase and SHOULD be resolved before the relevant
slice lands.

1. **Domain name** — the dev domain is a placeholder `<dev-domain>`
   in the capability specs. Suggest `dev.jochosepw.com` (or similar)
   under a new Route53 zone, with the apex reserved for the eventual
   `prod` slice. Confirm before S4 (Route53 + DNSSEC).
2. **Dev-only OK** — yes for this change. The `prod` environment is
   a follow-up slice (S6 in the proposal) and is not in scope here.
3. **Infra-repo org placement** — `<infra-repo-org>` is a
   placeholder. The new `jochos-epw-infra` repo is scaffolded as a
   sibling; final GitHub org placement is decided at apply time.
4. **Project rename** — `jochos-epw` is the current working name per
   `openspec/config.yaml` ("working name; subject to rename during
   proposal phase"). If a rename is happening, the bucket name, the
   domain choice, and the repo names SHOULD reflect the final name.
   Surface the final name before S1 lands to avoid rename churn
   mid-bootstrap.
