---
description: Create a new repository following organizational standards
---

# /wdi:new-repo - Create Repository

Create a new GitHub repository using an interview-driven workflow that enforces WDI naming standards.

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmations after interview |
| `--clone` | Clone locally after creation |

---

## Workflow

### Phase 1: Interview

Use `AskUserQuestion` to gather context. Questions adapt based on answers.

#### Question 1: Repository Purpose

```
What type of project is this?
```

| Option | Description |
|--------|-------------|
| **Claude Code Plugin** | Commands installed via `curl \| bash`, needs independent versioning |
| **Cluster Mono-repo** | Related packages grouped by domain (marketing, business, dev) |
| **Standalone Project** | Single-purpose project with external consumers |
| **Experiment/Spike** | Temporary research with 90-day lifecycle |

#### Question 2: Domain (Based on Type)

**If Plugin:**
```
What domain does this plugin serve?
```
| Option | Description |
|--------|-------------|
| `workflow` | Development workflows, commits, features |
| `frontend` | UI components, design, styling |
| `backend` | APIs, databases, services |
| `analytics` | Reporting, metrics, dashboards |
| Other | Custom domain (user enters) |

**If Mono-repo:**
```
Which cluster does this belong to?
```
| Option | Description |
|--------|-------------|
| `marketing` | Marketing intelligence, ads, SEO, content |
| `business` | Operations, finance, events, guest services |
| `dev` | Development tooling (non-plugin) |
| `knowledge` | Research, education, documentation |
| Other | New cluster (user enters) |

**If Standalone:**
```
Briefly describe the project's purpose:
```
(Free text - used to suggest a name)

#### Question 3: Description

```
One-line description for the repository:
```
(Free text)

---

### Phase 2: Name Proposal

Based on interview answers, propose a name following standards:

| Type | Pattern | Example |
|------|---------|---------|
| Plugin | `dev-plugins-{domain}` | `dev-plugins-analytics` |
| Mono-repo | `{cluster}-ops` | `marketing-ops` |
| Standalone | `{descriptive-name}` | `guest-portal` |
| Experiment | `experiment-{name}` | `experiment-graphql-api` |

**Present proposal:**

```
Based on your answers, the recommended repository name is:

    dev-plugins-analytics

This follows the naming standard:
  ✓ Plugin repos use: dev-plugins-{domain}
  ✓ Lowercase with hyphens
  ✓ No wdi- prefix (org provides context)

Accept this name?
```

| Option | Description |
|--------|-------------|
| **Accept** | Use the recommended name |
| **Modify** | Enter a different name |

---

### Phase 3: Name Validation (If Modified)

If user enters a custom name, validate against standards:

**Read:** `docs/standards/REPO-STANDARDS.md`

**Validation checks:**
1. Lowercase only
2. Hyphens only (no underscores)
3. No `wdi-` prefix
4. Matches expected pattern for type

**If compliant:**

```
✓ Your name "{name}" follows the naming standard.

Proceed with this name?
```

**If non-compliant:**

```
⚠️  Name "{name}" doesn't match the naming standard.

Issues found:
  ✗ Plugin repos should use: dev-plugins-{domain}
  ✗ Your name: {name}

You can still use this name, but please provide a reason.
This helps us improve our standards.
```

Use `AskUserQuestion`:

```
Why does this name work better for your use case?
```

| Option | Description |
|--------|-------------|
| **Existing convention** | Following an external or legacy convention |
| **Clarity** | Standard name would be confusing in this context |
| **Integration** | Name must match external system requirements |
| **Standard should change** | The naming standard itself needs updating |
| Other | Custom explanation |

---

### Phase 4: Exception Handling

If user provided an exception reason, capture it:

#### Store Exception

Create `.github/naming-exceptions.md` in the NEW repo (if it doesn't exist):

```markdown
# Naming Exceptions

This repository's name deviates from standard conventions.

## Exception Details

| Field | Value |
|-------|-------|
| Standard Name | `dev-plugins-{domain}` |
| Actual Name | `{user-chosen-name}` |
| Reason | {user-provided-reason} |
| Date | {today} |
| Created By | Claude Code |

## Context

{Additional context from interview}
```

#### Detect Standard Change Opportunity

Analyze if exception suggests a standard update:

**Triggers for standard review:**
- User selected "Standard should change"
- Same exception pattern seen before (check other repos)
- Exception reason mentions common use case
- User explicitly requests standard review

**If triggered, create GitHub Issue:**

```bash
gh issue create \
  --repo whitedoeinn/dev-plugins-workflow \
  --title "Consider naming standard update: {pattern}" \
  --body "$(cat <<'EOF'
## Naming Exception Detected

A new repository was created with a name that deviates from our naming standard.

### Details

| Field | Value |
|-------|-------|
| Repository | `{repo-name}` |
| Expected Pattern | `{expected-pattern}` |
| User's Reason | {reason} |

### Context

{Interview answers and context}

### Suggested Action

Review whether the naming standard should be updated to accommodate this use case.

**Options:**
1. Keep standard as-is (this is a valid exception)
2. Update standard to allow this pattern
3. Add guidance for this edge case to REPO-STANDARDS.md

### References

- [REPO-STANDARDS.md](docs/standards/REPO-STANDARDS.md)
- [Naming Decision Tree](knowledge/decision-trees/repo-type.md)

---
*Auto-generated by `/wdi:new-repo`*
EOF
)"
```

**Inform user:**

```
📋 Created issue to review naming standard:
   https://github.com/whitedoeinn/dev-plugins-workflow/issues/{number}

Your feedback helps improve our standards!
```

---

### Phase 5: Create Repository

```bash
gh repo create whitedoeinn/{name} --private --description "{description}"
```

### Phase 6: Initialize Structure

Based on type, create appropriate structure:

**For Mono-repos:**
```
{repo}/
├── packages/
├── shared/
├── docs/
│   ├── architecture.md
│   └── changelog.md
├── scripts/
├── README.md
└── .gitignore
```

**For Plugins:**
```
{repo}/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── commands/
├── hooks/
│   └── hooks.json
├── scripts/
├── docs/
│   ├── changelog.md
│   └── troubleshooting.md
├── knowledge/
├── install.sh
├── README.md
├── CLAUDE.md
├── CONTRIBUTING.md
└── .gitignore
```

**For Standalone:**
```
{repo}/
├── src/
├── tests/
├── docs/
│   └── changelog.md
├── scripts/
├── README.md
├── CLAUDE.md
└── .gitignore
```

**For Experiments:**
```
{repo}/
├── README.md
├── docs/
│   └── findings.md
└── .gitignore
```

Add to README for experiments:
```markdown
> ⚠️ **Experiment**: This repo has a 90-day lifecycle.
> Created: {date} | Expires: {date+90}
> Either promote to permanent repo or delete with documented learnings.
```

### Phase 7: Initial Commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: Initialize {type} repository

Set up standard directory structure and documentation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

### Phase 8: Output

```
✓ Repository created: https://github.com/whitedoeinn/{name}

Structure:
{tree output}

Next steps:
1. cd {name}
2. Start adding packages/code
3. Update README with specifics

For plugins: Run /wdi:setup to verify configuration
```

---

## Examples

### Standard plugin creation

```
/wdi:new-repo

? What type of project is this?
  → Claude Code Plugin

? What domain does this plugin serve?
  → analytics

? One-line description:
  → "Claude Code commands for analytics and reporting"

Recommended name: dev-plugins-analytics
  ✓ Follows naming standard

? Accept this name?
  → Accept

✓ Created: https://github.com/whitedoeinn/dev-plugins-analytics
```

### Custom name with exception

```
/wdi:new-repo

? What type of project is this?
  → Claude Code Plugin

? What domain does this plugin serve?
  → frontend

? One-line description:
  → "Tailwind and DaisyUI component helpers"

Recommended name: dev-plugins-frontend
  ✓ Follows naming standard

? Accept this name?
  → Modify

? Enter your preferred name:
  → "claude-ui-toolkit"

⚠️  Name doesn't match standard:
  ✗ Expected: dev-plugins-{domain}

? Why does this name work better?
  → Standard should change

? Please explain:
  → "This will be published as an npm package.
     The dev-plugins- prefix doesn't make sense
     for external package consumers."

📋 Created issue #47 to review naming standard
✓ Created: https://github.com/whitedoeinn/claude-ui-toolkit
```

### Quick mono-repo creation

```
/wdi:new-repo --clone

? What type of project is this?
  → Cluster Mono-repo

? Which cluster?
  → business

? One-line description:
  → "Business operations automation"

Recommended name: business-ops
  ✓ Follows naming standard

? Accept this name?
  → Accept

✓ Created and cloned to ./business-ops
```

---

## Notes

- Requires `gh` CLI authenticated (`gh auth login`)
- All repos created as private by default
- Exception reasons are stored in the new repo's `.github/` directory
- Standard review issues are created on `dev-plugins-workflow` repo
- See `docs/standards/REPO-STANDARDS.md` for full naming conventions
