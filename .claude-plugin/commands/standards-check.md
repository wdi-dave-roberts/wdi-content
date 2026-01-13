---
description: Validate current repository against WDI standards
---

# /wdi:check-standards - Standards Validation

Check the current repository against WDI development standards and report any issues.

## Flags

| Flag | Description |
|------|-------------|
| `--fix` | Attempt to auto-fix issues where possible |
| `--strict` | Treat warnings as errors |

---

## Workflow

### Step 1: Detect Repository Type

```bash
# Check for mono-repo indicators
if [ -d "packages" ]; then
  TYPE="mono-repo"
elif [ -d ".claude-plugin" ]; then
  TYPE="plugin"
else
  TYPE="standalone"
fi
```

### Step 2: Check Repository Name

Get repo name from git remote or directory:

```bash
REPO_NAME=$(basename $(git rev-parse --show-toplevel))
```

**Validation rules:**
- No `wdi-` prefix (deprecated)
- Lowercase with hyphens only
- Matches expected pattern for type

| Issue | Level |
|-------|-------|
| Has `wdi-` prefix | Warning |
| Has underscores | Error |
| Has uppercase | Error |
| Doesn't match type pattern | Warning |

### Step 3: Check Required Files

**All repositories:**

| File | Required | Level if Missing |
|------|----------|------------------|
| `README.md` | Yes | Error |
| `.gitignore` | Yes | Warning |
| `docs/changelog.md` | Yes | Warning |

**Claude Code projects:**

| File | Required | Level if Missing |
|------|----------|------------------|
| `CLAUDE.md` | Yes | Warning |

**Plugins:**

| File | Required | Level if Missing |
|------|----------|------------------|
| `.claude-plugin/plugin.json` | Yes | Error |
| `commands/*.md` | Yes | Error |
| `install.sh` | Yes | Warning |
| `hooks/hooks.json` | Recommended | Info |

**Mono-repos:**

| File | Required | Level if Missing |
|------|----------|------------------|
| `docs/architecture.md` | Yes | Warning |
| `packages/*/README.md` | Yes | Error |

### Step 4: Check Branch Name

```bash
BRANCH=$(git branch --show-current)
```

**Validation rules (if not on main):**
- Starts with valid prefix: `feature/`, `fix/`, `hotfix/`, `docs/`, `refactor/`, `chore/`, `experiment/`
- Uses hyphens, not underscores
- Lowercase only

| Issue | Level |
|-------|-------|
| Unknown prefix | Warning |
| Has underscores | Error |
| Has uppercase | Warning |

### Step 5: Check Recent Commits

```bash
git log --oneline -5
```

**Validation rules:**
- Commit messages start with type prefix
- No periods at end of subject line
- Subject under 72 characters

| Issue | Level |
|-------|-------|
| Missing type prefix | Warning |
| Subject too long | Info |

### Step 6: Check Directory Structure

**For mono-repos:**
- `packages/` exists and has subdirectories
- Each package has `README.md`
- No package named `utils`, `common`, `shared` (should be in `shared/`)

**For plugins:**
- `commands/` exists and has `.md` files
- Command files have YAML frontmatter

**For all:**
- No `.DS_Store` files (add to `.gitignore`)
- No `node_modules/` or `venv/` committed

### Step 7: Generate Report

```
Standards Check: {repo-name}
══════════════════════════════════════════════════════

Repository Type: {type}
Branch: {branch}

✓ Passed: {count}
⚠ Warnings: {count}
✗ Errors: {count}

──────────────────────────────────────────────────────
ERRORS (must fix)
──────────────────────────────────────────────────────

✗ Missing required file: CLAUDE.md
  → Create CLAUDE.md with project overview for Claude Code

✗ Package missing README: packages/api-ga4/
  → Add packages/api-ga4/README.md

──────────────────────────────────────────────────────
WARNINGS (should fix)
──────────────────────────────────────────────────────

⚠ Repository name uses deprecated wdi- prefix
  → Consider renaming to remove prefix (org provides context)

⚠ Branch name "feature/Add_Login" uses underscores
  → Use hyphens: feature/add-login

──────────────────────────────────────────────────────
INFO (optional)
──────────────────────────────────────────────────────

ℹ No hooks/hooks.json found
  → Consider adding SessionStart hook for dependency checking

══════════════════════════════════════════════════════
```

### Step 8: Auto-fix (if --fix)

For issues that can be auto-fixed:

| Issue | Fix |
|-------|-----|
| Missing `.gitignore` | Create with common patterns |
| Missing `CLAUDE.md` | Create template |
| Missing `docs/changelog.md` | Create template |
| `.DS_Store` exists | Delete and add to `.gitignore` |

```
Auto-fixing...

✓ Created .gitignore
✓ Created CLAUDE.md (template)
✓ Deleted .DS_Store
✓ Added .DS_Store to .gitignore

Fixed 4 issues. 2 issues require manual attention.
```

### Step 9: Exit Code

| Condition | Exit Code |
|-----------|-----------|
| All passed | 0 |
| Only warnings | 0 (or 1 if `--strict`) |
| Has errors | 1 |

---

## Examples

### Basic check

```
/wdi:check-standards

Standards Check: marketing-ops
══════════════════════════════════════════════════════

✓ Passed: 12
⚠ Warnings: 2
✗ Errors: 0

All critical standards met. See warnings above.
```

### Check with auto-fix

```
/wdi:check-standards --fix

Standards Check: new-project
══════════════════════════════════════════════════════

Auto-fixing...
✓ Created CLAUDE.md (template)
✓ Created docs/changelog.md (template)

Remaining issues:
⚠ packages/api-new/README.md needs content
```

### Strict mode for CI

```
/wdi:check-standards --strict

Standards Check: dev-plugins-workflow
══════════════════════════════════════════════════════

✓ Passed: 15
✗ Errors: 0 (strict mode: 0 warnings treated as errors)

All standards met!
```

---

## Notes

- Run before major commits to catch issues early
- Use `--strict` in CI/CD pipelines
- Auto-fix creates templates that need customization
- See `docs/standards/` for full standards documentation
