# Decision Tree: Package Location

Use this flowchart to determine where a new package belongs within a mono-repo.

---

## Flowchart

```
                    ┌──────────────────────────────────────┐
                    │  What domain does this package       │
                    │  primarily serve?                    │
                    └───────────────┬──────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
   MARKETING                    BUSINESS                      DEV
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│  marketing-ops/   │    │  business-ops/    │    │  Is it a plugin?  │
│  packages/        │    │  packages/        │    └─────────┬─────────┘
└─────────┬─────────┘    └─────────┬─────────┘              │
          │                        │                ┌───────┴───────┐
          ▼                        ▼               YES              NO
┌───────────────────┐    ┌───────────────────┐      │               │
│  Package types:   │    │  Package types:   │      ▼               ▼
│  - dashboard      │    │  - events         │  Standalone    dev-tools/
│  - api-{service}  │    │  - bookkeeping    │  repo         packages/
│  - cli            │    │  - guest-*        │
│  - reports        │    │  - analytics      │
└───────────────────┘    └───────────────────┘
```

---

## Package Naming Within Mono-repos

### Pattern

```
packages/{type}-{function}/
```

Or simply:

```
packages/{function}/
```

### Examples by Cluster

**marketing-ops:**
```
packages/
├── dashboard/           # Web dashboard
├── api-ga4/            # Google Analytics wrapper
├── api-google-ads/     # Google Ads wrapper
├── api-mailchimp/      # Email marketing
├── cli/                # Command line tools
└── reports/            # Report generation
```

**business-ops:**
```
packages/
├── events/             # Event management
├── bookkeeping/        # QBO integration
├── guest-surveys/      # Guest feedback
├── guest-portal/       # Guest-facing app
└── analytics/          # Business analytics
```

**knowledge-base:**
```
packages/
├── research/           # Research spikes
├── training/           # Training materials
├── competitive/        # Competitive analysis
└── experiments/        # 90-day experiments
```

---

## Shared Code Location

Within a mono-repo, shared code goes in `shared/`:

```
{repo}/
├── packages/
│   ├── dashboard/      # Uses shared/utils
│   └── api-ga4/        # Uses shared/auth
└── shared/
    ├── utils/          # Common utilities
    ├── auth/           # Authentication helpers
    └── types/          # Shared type definitions
```

**Rules for shared/**
- Code used by 2+ packages → move to shared
- Package-specific code → stays in package
- Never import from one package to another (use shared)

---

## When to Create a New Package

| Condition | Action |
|-----------|--------|
| New API integration | `packages/api-{service}/` |
| New user-facing tool | `packages/{tool-name}/` |
| Utility used by 1 package | Keep in that package |
| Utility used by 2+ packages | Move to `shared/` |
| Experiment | `experiments/{name}/` with 90-day limit |

---

## Anti-patterns

| Don't | Do Instead |
|-------|------------|
| `packages/utils/` | Put in `shared/utils/` |
| `packages/v2-dashboard/` | Version in git, not names |
| `packages/john-test/` | Use experiment with clear name |
| Import across packages | Extract to shared |
