---
description: Impact analysis and guided updates when changing development standards
---

# /wdi:update-standard - Standards Update Command

Analyze the impact of standard changes and guide updates to dependent files.

## Usage

```
/wdi:update-standard [--analyze] [--list] [--yes] [STANDARD-NAME]
```

## Flags

| Flag | Description |
|------|-------------|
| `--analyze` | Show impact analysis only (read-only, no changes) |
| `--list` | List all standards with their impact scores |
| `--yes` | Auto-accept updates (skip confirmations) |

---

## Modes

### 1. List Mode (`--list`)

Shows all standards with impact scores:

```
/wdi:update-standard --list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Standards Overview
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Standard                  | Impact | Complexity |
|---------------------------|--------|------------|
| PROJECT-STRUCTURE.md      | 6      | High       |
| REPO-STANDARDS.md         | 5      | Moderate   |
| CLAUDE-CODE-STANDARDS.md  | 5      | Moderate   |
| ISSUE-STANDARDS.md        | 5      | Moderate   |
| BRANCH-NAMING.md          | 3      | Simple     |
| COMMIT-STANDARDS.md       | 3      | Simple     |
| FILE-NAMING.md            | 3      | Simple     |
| DEPENDENCY-STANDARDS.md   | 3      | Simple     |

Use: /wdi:update-standard --analyze <STANDARD>
```

### 2. Analyze Mode (`--analyze`)

Read-only impact analysis before making changes:

```
/wdi:update-standard --analyze BRANCH-NAMING
```

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Impact Analysis: BRANCH-NAMING.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files that enforce this standard (must update logic):
  - skills/commit/SKILL.md - Branch validation step
  - commands/check-standards.md - Branch name check

Files that reference this standard (may need update):
  - knowledge/standards-summary.md - Branch naming section

Impact Score: 3 files
Complexity: Simple

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proceed with the change? This affects 3 files.
```

### 3. Update Mode (default)

Full guided workflow for updating all dependent files:

```
/wdi:update-standard BRANCH-NAMING
```

---

## Workflow

### Step 1: Parse Arguments

```
STANDARD_NAME = argument or prompt from list
MODE = --analyze | --list | update (default)
```

If no standard specified and not `--list`:
- Use `AskUserQuestion` to select from available standards

### Step 2: Read Dependency Map

**MUST USE** the helper script for reliable parsing:

```bash
# List all standards with impact scores
./scripts/get-standard-deps.sh --list

# Get dependencies for a specific standard
./scripts/get-standard-deps.sh BRANCH-NAMING
```

The script outputs structured data:
```
STANDARD: BRANCH-NAMING

ENFORCED_BY:
  skills/commit/SKILL.md (branch validation step)
  commands/check-standards.md (branch name check)

REFERENCED_BY:
  knowledge/standards-summary.md (branch naming quick reference)

IMPACT_SCORE: 3
COMPLEXITY: Simple
```

**Do not manually parse** the dependency map - always use the helper script.

### Step 3: Mode-Specific Behavior

#### For --list Mode:

1. Read all standards from `docs/standards/*.md`
2. Look up each in dependency map
3. Display table with impact scores

#### For --analyze Mode:

1. Display impact analysis
2. Show files that would need updating
3. Exit without making changes

#### For Update Mode:

1. Show impact analysis first
2. Ask: "Proceed with updates? (y/n)"
3. For each dependent file:
   - Read the file
   - Show relevant sections
   - Ask what changed in the standard
   - Assist with updating the file
   - Stage the file
4. Generate verification checklist
5. Offer to stage changelog entry

### Step 4: Update Each Dependent File

For each file in "Enforced by":

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step {N} of {total}: Update {filename}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This file enforces: {standard-name}
Section: {section description from map}

What changed in the standard that affects this file?
```

Use `AskUserQuestion` to capture:
- What changed (free text)
- Update this file? (yes/skip/view)

If yes:
- Open file for editing
- Make necessary changes
- Stage the file

### Step 5: Update Reference Files

For each file in "Referenced by":

```
This file references {standard-name}
Section: {section description}

Update this reference? (y)es, (s)kip, (v)iew:
```

Reference files often need lighter updates (text changes only).

### Step 6: Verification Checklist

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Update Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Updated: {count} files
  - {file1}
  - {file2}
  - ...

Skipped: {count} files
  - {file3}

Verification checklist:
  [ ] Review all changes: git diff --cached
  [ ] Test affected commands
  [ ] Add changelog entry
  [ ] Commit with: docs: Update {STANDARD-NAME}

Ready to commit? (y)es, (r)eview changes, (a)bort:
```

### Step 7: Commit (if approved)

```bash
# Stage changelog entry
git add docs/changelog.md

# Create commit
git commit -m "docs: Update {STANDARD-NAME} and all dependents"
```

---

## Standards Reference

| Standard | Path |
|----------|------|
| REPO-STANDARDS | docs/standards/REPO-STANDARDS.md |
| BRANCH-NAMING | docs/standards/BRANCH-NAMING.md |
| COMMIT-STANDARDS | docs/standards/COMMIT-STANDARDS.md |
| PROJECT-STRUCTURE | docs/standards/PROJECT-STRUCTURE.md |
| FILE-NAMING | docs/standards/FILE-NAMING.md |
| CLAUDE-CODE-STANDARDS | docs/standards/CLAUDE-CODE-STANDARDS.md |
| ISSUE-STANDARDS | docs/standards/ISSUE-STANDARDS.md |
| DEPENDENCY-STANDARDS | docs/standards/DEPENDENCY-STANDARDS.md |

---

## Integration with PreCommit Hook

The `scripts/pre-commit-standards.sh` hook triggers when standard files are staged:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Standards file change detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Changed standards:
  BRANCH-NAMING

Run impact analysis:
  /wdi:update-standard --analyze

Or use the full update workflow:
  /wdi:update-standard BRANCH-NAMING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Examples

### Check impact before making a change

```
/wdi:update-standard --analyze PROJECT-STRUCTURE

Impact Score: 6 files (High complexity)

This is a high-impact change. Consider:
- Is this change necessary?
- Can it be broken into smaller changes?
- Have you tested the change locally?
```

### Quick update for simple standard

```
/wdi:update-standard --yes COMMIT-STANDARDS

→ Updating skills/commit/SKILL.md... done
→ Updating commands/check-standards.md... done
→ Updating knowledge/standards-summary.md... done

✓ 3 files updated
✓ Staged for commit
```

### Interactive update with review

```
/wdi:update-standard ISSUE-STANDARDS

Step 1 of 5: Update commands/feature.md
This file enforces: ISSUE-STANDARDS
Section: Issue creation format

What changed? > Added new 'priority' label options

[Opens file for review]
Update this file? (y)es, (s)kip, (v)iew: y

→ Updated commands/feature.md

Step 2 of 5: Update .github/ISSUE_TEMPLATE/bug_report.md
...
```

---

## Notes

- Always run `--analyze` first to understand impact
- High-complexity changes (6+ files) warrant careful consideration
- The dependency map (`knowledge/standards-dependency-map.md`) is the source of truth
- Keep the dependency map updated when adding new standards
- See `docs/standards/STANDARDS-UPDATE-PROTOCOL.md` for the full protocol
