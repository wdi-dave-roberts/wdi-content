---
description: Create a new subproject within a mono-repo following standards
---

# /wdi:new-subproject - Create Subproject

Add a new subproject to an existing mono-repo using an interview-driven workflow that enforces WDI naming standards.

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmations after interview |

---

## Workflow

### Phase 1: Verify Context

Check we're in a mono-repo:

```bash
ls packages/ 2>/dev/null
```

**If not in a mono-repo:**

```
Not in a mono-repo (no packages/ directory found).

Use /wdi:new-repo to create a mono-repo first.
```

ABORT if not in a mono-repo.

---

### Phase 2: Interview

Use `AskUserQuestion` to gather context. Questions adapt based on answers.

#### Question 1: Package Purpose

```
What type of subproject is this?
```

| Option | Description |
|--------|-------------|
| **API Wrapper** | Wraps external service (GA4, Mailchimp, Stripe) |
| **Tool/Utility** | Internal tool (dashboard, cli, reports) |
| **Guest-Facing** | Customer-facing functionality |
| **Shared Library** | Code shared across subprojects |
| **Content/Docs** | Documentation, research, or static content |

#### Question 2: Target/Domain (Based on Type)

**If API Wrapper:**
```
Which external service does this wrap?
```
| Option | Description |
|--------|-------------|
| `ga4` | Google Analytics 4 |
| `mailchimp` | Mailchimp email service |
| `stripe` | Stripe payments |
| `cloudflare` | Cloudflare services |
| Other | Custom service (user enters) |

**If Tool/Utility:**
```
What is the tool's primary function?
```
| Option | Description |
|--------|-------------|
| `dashboard` | Visual reporting interface |
| `cli` | Command-line interface |
| `reports` | Report generation |
| `etl` | Data extraction/transformation |
| Other | Custom function (user enters) |

**If Guest-Facing:**
```
What guest function does this serve?
```
| Option | Description |
|--------|-------------|
| `portal` | Guest self-service portal |
| `surveys` | Guest feedback collection |
| `booking` | Reservation functionality |
| `messaging` | Guest communication |
| Other | Custom function (user enters) |

**If Shared Library:**
```
What does this library provide?
```
| Option | Description |
|--------|-------------|
| `auth` | Authentication/authorization |
| `db` | Database access layer |
| `types` | Shared TypeScript/Python types |
| `config` | Configuration management |
| Other | Custom purpose (user enters) |

**If Content/Docs:**
```
What content type is this?
```
| Option | Description |
|--------|-------------|
| `research` | Research findings and analysis |
| `docs` | Documentation |
| `templates` | Reusable templates |
| `specs` | Specifications and requirements |
| Other | Custom content type (user enters) |

#### Question 3: Package Technology

```
What technology stack?
```

| Option | Description |
|--------|-------------|
| **Python** | pyproject.toml, src/, tests/ |
| **Node/TypeScript** | package.json, src/, __tests__/ |
| **Content Only** | README.md only (no code) |

#### Question 4: Description

```
One-line description for the subproject:
```
(Free text)

---

### Phase 3: Name Proposal

Based on interview answers, propose a name following standards:

| Type | Pattern | Example |
|------|---------|---------|
| API Wrapper | `api-{service}` | `api-ga4`, `api-mailchimp` |
| Tool/Utility | `{function}` | `dashboard`, `cli`, `reports` |
| Guest-Facing | `guest-{function}` | `guest-portal`, `guest-surveys` |
| Shared Library | `lib-{purpose}` | `lib-auth`, `lib-types` |
| Content/Docs | `{content-type}` | `research`, `docs`, `specs` |

**Present proposal:**

```
Based on your answers, the recommended subproject name is:

    api-ga4

This follows the naming standard:
  ✓ API wrappers use: api-{service}
  ✓ Lowercase with hyphens
  ✓ Descriptive of function

Accept this name?
```

| Option | Description |
|--------|-------------|
| **Accept** | Use the recommended name |
| **Modify** | Enter a different name |

---

### Phase 4: Name Validation (If Modified)

If user enters a custom name, validate against standards:

**Read:** `knowledge/decision-trees/package-location.md`

**Validation checks:**
1. Lowercase only
2. Hyphens only (no underscores)
3. No generic names (`utils`, `common`, `shared`, `helpers`)
4. Matches expected pattern for type
5. Doesn't conflict with existing subprojects

**If compliant:**

```
✓ Your name "{name}" follows the naming standard.

Proceed with this name?
```

**If non-compliant:**

```
⚠️  Name "{name}" doesn't match the naming standard.

Issues found:
  ✗ API wrappers should use: api-{service}
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

### Phase 5: Exception Handling

If user provided an exception reason, capture it:

#### Store Exception

Create `.github/subproject-naming-exceptions.md` in the mono-repo (if it doesn't exist):

```markdown
# Package Naming Exceptions

Packages in this repository that deviate from standard conventions.

## Exceptions

| Package | Standard Name | Actual Name | Reason | Date |
|---------|---------------|-------------|--------|------|
| {user-chosen-name} | {expected-pattern} | {user-chosen-name} | {user-provided-reason} | {today} |
```

If file exists, append new row to the table.

#### Detect Standard Change Opportunity

Analyze if exception suggests a standard update:

**Triggers for standard review:**
- User selected "Standard should change"
- Same exception pattern seen before (check other subprojects)
- Exception reason mentions common use case
- User explicitly requests standard review

**If triggered, create GitHub Issue:**

```bash
gh issue create \
  --repo whitedoeinn/dev-plugins-workflow \
  --title "Consider subproject naming standard update: {pattern}" \
  --body "$(cat <<'EOF'
## Package Naming Exception Detected

A new subproject was created with a name that deviates from our naming standard.

### Details

| Field | Value |
|-------|-------|
| Mono-repo | `{repo-name}` |
| Package | `{subproject-name}` |
| Expected Pattern | `{expected-pattern}` |
| User's Reason | {reason} |

### Context

{Interview answers and context}

### Suggested Action

Review whether the subproject naming standard should be updated to accommodate this use case.

**Options:**
1. Keep standard as-is (this is a valid exception)
2. Update standard to allow this pattern
3. Add guidance for this edge case to package-location.md

### References

- [Package Location Decision Tree](knowledge/decision-trees/package-location.md)
- [FILE-NAMING.md](docs/standards/FILE-NAMING.md)

---
*Auto-generated by `/wdi:new-subproject`*
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

### Phase 6: Create Package Structure

**For Python subprojects:**

```bash
mkdir -p packages/{name}/src/{name_underscore}
mkdir -p packages/{name}/tests
touch packages/{name}/src/{name_underscore}/__init__.py
touch packages/{name}/tests/__init__.py
touch packages/{name}/tests/test_{name_underscore}.py
```

Create `pyproject.toml`:
```toml
[project]
name = "{name}"
version = "0.1.0"
description = "{description}"
requires-python = ">=3.11"

[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

**For Node/TypeScript subprojects:**

```bash
mkdir -p packages/{name}/src
mkdir -p packages/{name}/__tests__
touch packages/{name}/src/index.ts
touch packages/{name}/__tests__/{name}.test.ts
```

Create `package.json`:
```json
{
  "name": "@wdi/{name}",
  "version": "0.1.0",
  "description": "{description}",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  }
}
```

**For Content subprojects:**

```bash
mkdir -p packages/{name}
```

---

### Phase 7: Create README

```markdown
# {name}

{description}

## Overview

(Add subproject overview here)

## Usage

```python
# Python
from {name_underscore} import ...
```

```typescript
// TypeScript
import { ... } from '@wdi/{name}';
```

## Development

### Setup

```bash
cd packages/{name}
# Python: pip install -e .
# Node: npm install
```

### Testing

```bash
# Python: pytest
# Node: npm test
```

## API Reference

(Document public API here)
```

---

### Phase 8: Update Mono-repo Documentation

#### Update Root README

Add subproject to the subprojects table in root `README.md`:

```markdown
| {name} | {description} |
```

#### Update Changelog

Add entry to `docs/changelog.md`:

```markdown
## {date}

### Added
- New subproject: `{name}` - {description}
```

---

### Phase 9: Output

```
✓ Package created: packages/{name}/

Structure:
packages/{name}/
├── README.md
├── src/
│   └── {name_underscore}/
│       └── __init__.py
├── tests/
│   └── test_{name_underscore}.py
└── pyproject.toml

Next steps:
1. cd packages/{name}
2. Implement your subproject in src/
3. Add tests in tests/
4. Update README with usage examples

Commit when ready (say "commit these changes")
```

---

## Examples

### Standard API wrapper creation

```
/wdi:new-subproject

? What type of subproject is this?
  → API Wrapper

? Which external service does this wrap?
  → ga4

? What technology stack?
  → Python

? One-line description:
  → "Google Analytics 4 reporting API wrapper"

Recommended name: api-ga4
  ✓ Follows naming standard

? Accept this name?
  → Accept

✓ Created: packages/api-ga4/
```

### Custom name with exception

```
/wdi:new-subproject

? What type of subproject is this?
  → Tool/Utility

? What is the tool's primary function?
  → dashboard

? What technology stack?
  → Node/TypeScript

? One-line description:
  → "Real-time marketing metrics dashboard"

Recommended name: dashboard
  ✓ Follows naming standard

? Accept this name?
  → Modify

? Enter your preferred name:
  → "marketing-dash"

⚠️  Name doesn't match standard:
  ✗ Expected: dashboard (or similar function name)

? Why does this name work better?
  → Clarity

? Please explain:
  → "We have multiple dashboards; 'dashboard' alone
     is ambiguous. 'marketing-dash' is clearer."

✓ Created: packages/marketing-dash/
  📝 Exception documented in .github/subproject-naming-exceptions.md
```

### Quick creation with --yes

```
/wdi:new-subproject --yes

? What type of subproject is this?
  → Shared Library

? What does this library provide?
  → auth

? What technology stack?
  → Python

? One-line description:
  → "JWT authentication utilities"

Recommended name: lib-auth
  ✓ Follows naming standard

? Accept this name?
  → [Auto-accepted with --yes]

✓ Created: packages/lib-auth/
```

---

## Notes

- Must be run from mono-repo root (requires `packages/` directory)
- Auto-detects existing subproject technology patterns
- Updates root README and changelog automatically
- Exception reasons are stored in `.github/subproject-naming-exceptions.md`
- Standard review issues are created on `dev-plugins-workflow` repo
- See `knowledge/decision-trees/package-location.md` for naming guidance
