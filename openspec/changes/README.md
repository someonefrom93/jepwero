# Active Changes

Created changes land here as `openspec/changes/{change-name}/` and follow the SDD phase flow:

```
{change-name}/
├── state.yaml       <- DAG state (survives compaction)
├── exploration.md   <- sdd-explore (optional)
├── proposal.md      <- sdd-propose
├── specs/           <- sdd-spec
├── design.md        <- sdd-design
├── tasks.md         <- sdd-tasks (updated by sdd-apply)
└── verify-report.md <- sdd-verify
```

Completed changes move to `archive/YYYY-MM-DD-{change-name}/`.
