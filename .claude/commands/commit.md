---
description: Smart commit with tests, context detection, and changelog (project)
---

# /commit - Smart Commit Workflow

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip prompts, auto-accept defaults |
| `--summary` | Generate fun changelog summary after commit |
| `--skip-review` | Skip simplicity review |
| `--skip-tests` | Skip tests |

## Fast Path: --yes

Stages all → runs tests → runs simplicity review → auto-generates message → merges feature branches to main → updates changelog → pushes.

Aborts if: tests fail, simplicity issues found, merge conflicts.

---

## Workflow

### Step 1: Check Status

```bash
git status --short
```

- Clean tree: ABORT "Nothing to commit."
- Unstaged changes: Ask "(a)dd all, (s)elect files, (c)ontinue with staged, (q)uit"
- Optional: "Review diffs? [y/n]" → show file picker

### Step 2: Run Tests

Skip if --skip-tests. Detect and run:

| Staged Files    | Command                           |
|-----------------|-----------------------------------|
| *.py            | pytest (activate venv if present) |
| *.ts/*.tsx/*.js | npm test                          |

Fail = ABORT

### Step 3: Simplicity Review

Skip if --skip-review or <50 lines changed.

Use Task tool: subagent_type='compound-engineering:review:code-simplicity-reviewer'

Catches: unnecessary abstraction, scope creep, premature optimization, YAGNI.

- Issues found: Ask "Fix before committing? [y/n]"
- With --yes: Issues = ABORT

### Step 4: Generate Message

Analyze diff. Focus on "why" not "what". Keep concise.

### Step 5: Detect Context

| Branch Pattern     | Prefix                                    |
|--------------------|-------------------------------------------|
| feature/FEAT-XXX-* | FEAT-XXX:                                 |
| fix/NNN-*          | Fixes #NNN:                               |
| main               | Ask: (f)eature, (i)ssue, (h)otfix, (n)one |

### Step 6: Confirm Message

```
Proposed commit message:
───────────────────────────────────────
FEAT-012: Add campaign filter dropdown

Implement status and budget filters.

🤖 Generated with Claude Code
───────────────────────────────────────

(y)es, (e)dit, (a)bort:
```

### Step 7: Branch Handling

On feature/fix branch, ask: "Final commit? (merge to main) [y/n]"

- Yes: Commit → checkout main → pull → merge --no-ff → continue
- No: Commit → push → done

### Step 8: Update Changelog

File: docs/changelog.md

Create if missing:
```markdown
# Changelog

All notable changes documented here.

---
```

Add entry under today's date:
```markdown
## YYYY-MM-DD

- **FEAT-XXX**: Description
- **Fix #NNN**: Description
- Hotfix: Description
- Description (no prefix)
```

Rules:
- If today's section exists, append to it
- If not, create new section at top
- Keep entries concise

### Step 9: Push

```bash
git add docs/changelog.md
git commit --amend --no-edit
git push
```

If merged from branch:
```bash
git branch -d <branch>
git push origin --delete <branch>
```

### Step 10: Summary (--summary flag)

Invoke the changelog skill:

```
/compound-engineering:changelog
```

Generates a fun summary with:
- 🌟 New Features
- 🐛 Bug Fixes
- 🛠️ Improvements
- 🙌 Shoutouts (you deserve it!)
- 🎉 Fun Fact

---

## Examples

### Quick commit

```
/commit --yes
```

```
→ Staging all changes...
→ Running tests... ✓ passed
→ Simplicity review... ✓ clean
✓ Committed: Add export button
✓ Changelog updated
✓ Pushed to main
```

### With celebration

```
/commit --yes --summary
```

```
✓ Committed: Complete authentication system
✓ Changelog updated
✓ Pushed to main

# 🚀 Daily Change Log: 2026-01-09

## 🌟 New Features
- **Authentication System** - JWT tokens, refresh flow, logout

## 🙌 Shoutouts
You absolute legend. Shipped auth in one session. 🏆

## 🎉 Fun Fact
That's 847 lines of secure, tested code. Treat yourself!
```

---

## Notes

- Always adds 🤖 Generated with Claude Code to commits
- Never force push
- Aborts on merge conflicts
- Creates docs/changelog.md if missing

**Requires:** compound-engineering plugin for `--summary` and simplicity review.
