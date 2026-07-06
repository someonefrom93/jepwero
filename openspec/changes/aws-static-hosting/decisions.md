# Decisions — aws-static-hosting (Phase 0)

Resolved 2026-07-05. Source of truth for the four open questions from `proposal.md` § Open questions. This file is read FIRST by any future `sdd-apply` run for the `aws-static-hosting` change. Do not edit planning artifacts (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) to reflect these — the placeholders they contain are intentional and stand for these decisions.

## 1. Domain name

**Decision**: Apex hosted zone `jochos-el-perro-wero.com`. Dev hostname is `dev.jochos-el-perro-wero.com`. The apex (`jochos-el-perro-wero.com`) is reserved for the future prod slice (S6 follow-up) and currently has no records.

**Note on interpretation**: The proposal suggested `dev.<apex>` and flagged the apex as "reserved for prod". The user supplied the apex `jochos-el-perro-wero.com`; the proposal convention is adopted — `dev.jochos-el-perro-wero.com` is the dev hostname, with the apex left empty in the Route53 zone until S6 lands.

## 2. Dev-only scope

**Decision**: Yes — this change ships ONLY the dev environment. `prod` stays as the optional S6 follow-up slice and is NOT executed as part of this change. The slice plan stays at S1..S5; S6 is documented in `design.md` §4.6 and `tasks.md` Phase 6 for future use.

## 3. Infra-repo GitHub org for `jochos-epw-infra`

**Decision**: Same GitHub org as the app repo `jochos-epw`. The infra repo is a sibling at `<app-repo-org>/jochos-epw-infra`.

`<app-repo-org>` is recorded at apply time from the git remote of `jochos-epw`. The orchestrator read the remote as `someonefrom93/jochos-epw`; if `someonefrom93` is a placeholder, replace with the real org when applying. Either way, the answer here is "same org" — the specific org string is resolved at apply time.

## 4. Project name

**Decision**: Keep `jochos-epw` as the working name. No rename. All resource names that incorporate the project name use `jochos-epw` as the prefix or anchor.

A future rename (if any) is a separate OpenSpec change. Renaming inside this change is forbidden because it forces a churn across bucket names, IAM role names, state bucket name, KMS key aliases, OIDC trust condition, and the Route53 hosted zone — all mid-bootstrap.

## Implications for the chain

Substitute these placeholder -> concrete mappings everywhere downstream:

| Placeholder | Concrete value |
|---|---|
| `<dev-domain>` | `dev.jochos-el-perro-wero.com` |
| `<dev-bucket>` | `jochos-epw-static-dev` |
| `<state-bucket>` | `jochos-epw-tfstate-<account-id>-<region>` |
| `<lock-table>` | `jochos-epw-tflock` |
| `<name_prefix>` (in `envs/dev/main.tf`) | `jochos-epw-dev` |
| `<dev-deploy-role>` (deploy app role) | `jochos-epw-dev-deploy` |
| `<infra-ci-role>` (deploy infra role) | `jochos-epw-infra-ci` |
| `<infra-repo-org>` | `<app-repo-org>` (resolved from the app repo's git remote at apply time) |

## Carry-overs (not blockers, but worth flagging)

- **DNSSEC chain-of-trust at the registrar** is a manual step during slice S4. See `design.md` §4.4. The README §Bootstrap documents the registrar procedure; the orchestrator must read the DS record from the AWS console and paste it into the parent zone at the registrar.
- **`<app-repo-org>` resolution** happens at apply time. The orchestrator reads the app repo's git remote and uses its org component. If the remote is `someonefrom93/jochos-epw`, the org is `someonefrom93` (literal); if a different remote is in play at apply time, the orchestrator uses that one.
- **supabase-config.js deployment fix**: The gitignored file currently must be present at deploy time or the deploy fails loudly (see design §12 #9 / risk §14 #7). The production-grade fix — populate the file from a GitHub Actions secret — is a follow-up OpenSpec change. NOT in this change.
