# Decision Tree: Repository Type

Use this flowchart to determine whether a new project should be a mono-repo package or standalone repo.

---

## Flowchart

```
                    ┌──────────────────────────────────────┐
                    │  Is this a Claude Code plugin?       │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                   YES                              NO
                    │                               │
                    ▼                               ▼
    ┌───────────────────────────────┐  ┌────────────────────────────────┐
    │  STANDALONE REPO              │  │  Does it belong to an existing │
    │  dev-plugins-{domain}         │  │  cluster (marketing, business, │
    │                               │  │  dev, knowledge)?              │
    └───────────────────────────────┘  └───────────────┬────────────────┘
                                                       │
                                       ┌───────────────┴───────────────┐
                                       │                               │
                                      YES                              NO
                                       │                               │
                                       ▼                               ▼
                       ┌───────────────────────────────┐  ┌───────────────────────────────┐
                       │  Add as PACKAGE to existing   │  │  Is it experimental or a      │
                       │  mono-repo:                   │  │  research spike?              │
                       │  {cluster}-ops/packages/{name}│  └───────────────┬───────────────┘
                       └───────────────────────────────┘                  │
                                                          ┌───────────────┴───────────────┐
                                                          │                               │
                                                         YES                              NO
                                                          │                               │
                                                          ▼                               ▼
                                          ┌───────────────────────────────┐  ┌───────────────────────────────┐
                                          │  Add to KNOWLEDGE-BASE repo   │  │  Consider NEW CLUSTER         │
                                          │  as experiment package:        │  │  mono-repo if:                │
                                          │  knowledge-base/experiments/   │  │  - 3+ related packages        │
                                          │                               │  │  - Distinct domain            │
                                          │  90-day lifecycle:             │  │  - Shared deployment          │
                                          │  - Promote to feature OR       │  │                               │
                                          │  - Delete with learnings       │  │  Otherwise: add to closest    │
                                          └───────────────────────────────┘  │  existing cluster              │
                                                                             └───────────────────────────────┘
```

---

## Quick Decision Rules

| Condition | Repository Type |
|-----------|-----------------|
| Claude Code plugin | Standalone: `dev-plugins-*` |
| External consumers via URL | Standalone |
| Marketing tool | Mono-repo: `marketing-ops` |
| Business operations | Mono-repo: `business-ops` |
| Dev tooling (non-plugin) | Mono-repo: consider `dev-tools` |
| Research/education | Mono-repo: `knowledge-base` |
| Experimental | Package with 90-day expiry |

---

## Examples

| Project | Decision | Location |
|---------|----------|----------|
| GA4 API wrapper | Marketing cluster | `marketing-ops/packages/api-ga4` |
| Claude Code workflow plugin | Plugin = standalone | `dev-plugins-workflow` |
| Guest survey tool | Business cluster | `business-ops/packages/guest-surveys` |
| Testing a new API | Experiment | `knowledge-base/experiments/try-new-api` |
| Dashboard frontend | Marketing cluster | `marketing-ops/packages/dashboard` |

---

## Anti-patterns

| Don't | Why |
|-------|-----|
| Separate repo per API wrapper | They belong together in a cluster |
| Plugin in mono-repo | Plugins need independent versioning |
| Permanent "experiment" branches | Either promote or delete |
| Generic "tools" mono-repo | Cluster by domain, not type |
