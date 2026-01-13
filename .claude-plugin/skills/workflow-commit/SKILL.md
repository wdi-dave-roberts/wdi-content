---
name: commit
description: This skill should be used when committing code changes to git. It applies when the user asks to commit, push changes, save work, or mentions finishing work that needs to be committed. Triggers on phrases like "commit these changes", "commit this", "push this", "let's commit", "ready to commit", "save these changes", or any request involving git commit operations. Provides quality-gated commits with tests, simplicity review, and automatic changelog updates.
---

<objective>
Smart commit workflow that enforces quality gates before every commit:
- Runs tests automatically
- Performs simplicity review on large changes
- Generates meaningful commit messages
- Updates changelog automatically
- Handles branch merging to main

This ensures consistent code quality and documentation across all commits.
</objective>

<quick_start>
When the user wants to commit:

1. Run `git status --short` to check for changes
2. If no changes: Tell user "Nothing to commit"
3. If changes exist: Proceed with the full workflow below

**Note:** All `git commit` commands must use `COMMIT_SKILL_ACTIVE=1 git commit ...` to bypass the hook that blocks direct commits.
</quick_start>

<flags>
| Flag | Description |
|------|-------------|
| `--yes` | Skip prompts, auto-accept defaults. Aborts on test/review failures. |
| `--summary` | Generate fun changelog summary after commit |
| `--skip-review` | Skip simplicity review |
| `--skip-tests` | Skip tests |
</flags>

<workflow>
## Step 1: Check Status

```bash
git status --short
```

- Clean tree: ABORT "Nothing to commit."
- Unstaged changes: Ask "(a)dd all, (s)elect files, (c)ontinue with staged, (q)uit"
- Optional: "Review diffs? [y/n]" → show file picker

## Step 2: Validate Branch Name

Check branch follows naming standards (see `docs/standards/BRANCH-NAMING.md`):

```bash
BRANCH=$(git branch --show-current)
```

**Valid prefixes:** `feature/`, `fix/`, `hotfix/`, `docs/`, `refactor/`, `chore/`, `experiment/`

**Validation:**
- If on `main`: Skip validation
- If branch has underscores: Warn "Branch uses underscores. Standard is hyphens."
- If branch has unknown prefix: Warn "Unknown branch prefix. See BRANCH-NAMING.md"

With `--yes`: Warnings don't block, just display.

## Step 3: Run Tests

Skip if --skip-tests. Detect and run:

| Staged Files    | Command                           |
|-----------------|-----------------------------------|
| *.py            | pytest (activate venv if present) |
| *.ts/*.tsx/*.js | npm test                          |

Fail = ABORT

## Step 4: Simplicity Review

Skip if --skip-review or <50 lines changed.

Use Task tool: subagent_type='compound-engineering:review:code-simplicity-reviewer'

Catches: unnecessary abstraction, scope creep, premature optimization, YAGNI.

- Issues found: Ask "Fix before committing? [y/n]"
- With --yes: Issues = ABORT

## Step 5: Generate Message

Analyze diff. Focus on "why" not "what". Keep concise.

## Step 6: Detect Context

| Branch Pattern     | Prefix                                    |
|--------------------|-------------------------------------------|
| feature/FEAT-XXX-* | FEAT-XXX:                                 |
| fix/NNN-*          | Fixes #NNN:                               |
| main               | Ask: (f)eature, (i)ssue, (h)otfix, (n)one |

## Step 6.5: Version Bump (if plugin repo)

Skip this step if `.claude-plugin/plugin.json` doesn't exist or has no `version` field.

### Detect bump type from commit

Analyze the proposed commit message per `docs/standards/COMMIT-STANDARDS.md`:

| Signal | Action |
|--------|--------|
| Message starts with `docs:`, `chore:`, `test:`, `style:` | No bump |
| Message starts with `fix:`, `perf:` | Auto-bump patch |
| Message starts with `feat:`, `refactor:` | Prompt |
| Message body contains `BREAKING CHANGE:` | Prompt |
| Staged files in `commands/`, `skills/`, `hooks/` | Prompt |

### Auto-bump (no prompt)

For `fix:` or `perf:` commits, bump patch automatically:
```
Version: 0.1.0 → 0.1.1 (patch for fix)
```

### Prompt when needed

For features, refactors, or core file changes:
```
Version bump for feature commit.
Current: 0.1.0

  [m] Minor (0.2.0) - New feature or capability
  [p] Patch (0.1.1) - Small enhancement
  [n] None - Skip version bump

Choice [m/p/n]:
```

With `--yes`: Default to patch for features, skip for breaking (requires explicit choice).

### Apply bump

```bash
NEW_VERSION=$(./scripts/bump-version.sh <type>)
git add .claude-plugin/plugin.json
```

The version change is included in the same commit.

## Step 7: Confirm Message

```
Proposed commit message:
───────────────────────────────────────
FEAT-012: Add campaign filter dropdown

Implement status and budget filters.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
───────────────────────────────────────

(y)es, (e)dit, (a)bort:
```

## Step 8: Branch Handling

On feature/fix branch, ask: "Final commit? (merge to main) [y/n]"

- Yes: Commit → checkout main → pull → merge --no-ff → continue
- No: Commit → push → done

## Step 9: Update Changelog

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
- Focus on impact/why, not just what changed
- Good: "Fixed skills not auto-invoking - directory wasn't registered"
- Bad: "Added skills entry to plugin.json"

## Step 10: Push

```bash
git add docs/changelog.md
COMMIT_SKILL_ACTIVE=1 git commit --amend --no-edit
git push
```

If merged from branch:
```bash
git branch -d <branch>
git push origin --delete <branch>
```

## Step 10.5: Git Tag (if version bumped)

If a version bump was applied in Step 6.5, create and push a git tag:

```bash
VERSION=$(jq -r '.version' .claude-plugin/plugin.json)
git tag "v$VERSION"
git push origin "v$VERSION"
```

Output:
```
Tagged: v0.2.0
```

## Step 11: Summary (--summary flag only)

Invoke the changelog skill:

```
/compound-engineering:changelog
```

Generates a fun summary with emojis and shoutouts.
</workflow>

<success_criteria>
A successful commit workflow:
- Tests pass (or skipped with --skip-tests)
- Simplicity review passes (or skipped)
- Commit message is meaningful and approved
- Version bumped appropriately (if plugin repo)
- Changelog is updated with today's entry
- Changes are pushed to remote
- Git tag created (if version bumped)
- Branch is cleaned up if merged to main
</success_criteria>

<notes>
- Always adds `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` to commits
- Never force push
- Aborts on merge conflicts
- Creates docs/changelog.md if missing
- **Requires:** compound-engineering plugin for simplicity review and --summary
- **IMPORTANT:** All `git commit` commands MUST be prefixed with `COMMIT_SKILL_ACTIVE=1` to bypass the PreToolUse hook that blocks direct commits. Example: `COMMIT_SKILL_ACTIVE=1 git commit -m "message"`
</notes>
