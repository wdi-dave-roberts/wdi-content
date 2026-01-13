---
name: auto-update-docs
description: This skill should be used when updating documentation to match code changes. Triggers on "update the docs", "sync documentation", "update CLAUDE.md", "docs are out of date", or when finishing a feature that added commands/skills.
---

<objective>
Detect and fix documentation drift between source files and documentation.

When commands or skills are added/modified, documentation in CLAUDE.md and README.md
can become stale. This skill:
1. Detects undocumented commands and skills
2. Detects version mismatches
3. Updates documentation tables automatically
</objective>

<quick_start>
When the user wants to sync documentation:

1. Run `./scripts/check-docs-drift.sh --verbose`
2. If exit code 0: Tell user "Documentation is up to date"
3. If drift found: Show findings and offer to fix
</quick_start>

<flags>
| Flag | Description |
|------|-------------|
| `--check` | Dry run - show drift but don't fix anything |
| `--all` | Fix all drift without prompting for each item |
</flags>

<workflow>
## Step 1: Check for Drift

Run the drift detection script:

```bash
./scripts/check-docs-drift.sh --verbose
```

**If exit code 0:** Report "Documentation is up to date" and STOP.

**If drift found:** Continue to Step 2.

## Step 2: Parse Drift Report

The script outputs lines in format:
```
DRIFT:<type>:<name>:<issue>[:<detail>]
```

Types:
- `command` - A command file exists but isn't documented
- `skill` - A skill exists but isn't documented
- `version` - Version mismatch between plugin.json and docs

Issues:
- `missing_claude` - Not in CLAUDE.md
- `missing_readme` - Not in README.md
- `claude_mismatch` - Version differs (detail = current doc version)

## Step 3: Present Findings

```
Documentation Drift Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  • /wdi:new-command - missing from README.md

Skills:
  • auto-update-docs - missing from CLAUDE.md
  • auto-update-docs - missing from README.md

Version:
  • plugin.json: 0.2.0, CLAUDE.md: 0.1.0

(a)pply all fixes, (r)eview each, (c)heck only:
```

With `--all` flag: Skip prompt, apply all fixes.
With `--check` flag: Skip prompt, show findings only.

## Step 4: Apply Fixes

For each drift item, use the Edit tool to update documentation.

### Adding a Command to CLAUDE.md

Find the appropriate commands table (Workflow Commands or Standards Commands) and add a row.

Read the command's description from its YAML front matter:
```bash
grep "^description:" commands/{name}.md | sed 's/description: *//'
```

Add row to table:
```markdown
| `/wdi:{name}` | {description} |
```

### Adding a Command to README.md

Same pattern - find the commands table and add the row.

### Adding a Skill to CLAUDE.md

Find the "Skills (Auto-Invoked)" table and add:
```markdown
| `{skill-name}` | "{trigger phrase}" | {description} |
```

Extract trigger from skill's YAML description field.

### Adding a Skill to README.md

Same pattern - find the skills table and add the row.

### Fixing Version Mismatch

Update the version line in CLAUDE.md:
```markdown
Current version: {new-version} (see `.claude-plugin/plugin.json`)
```

## Step 5: Verify

Re-run the drift detection:

```bash
./scripts/check-docs-drift.sh
```

Should return exit code 0. If drift remains, report what couldn't be fixed.

## Step 6: Show Changes

```bash
git diff CLAUDE.md README.md
```

```
Documentation Updated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files modified:
  • CLAUDE.md
  • README.md

Changes:
  + Added skill 'auto-update-docs' to CLAUDE.md
  + Added skill 'auto-update-docs' to README.md

Ready to commit? (Say "commit these changes" to use commit skill)
```
</workflow>

<success_criteria>
A successful documentation sync:
- `./scripts/check-docs-drift.sh` returns exit code 0
- All commands in `commands/*.md` appear in CLAUDE.md and README.md
- All skills in `skills/*/SKILL.md` appear in CLAUDE.md and README.md
- Version in CLAUDE.md matches `.claude-plugin/plugin.json`
</success_criteria>

<notes>
- This skill updates CLAUDE.md and README.md only
- It does NOT update install.sh (that requires manual changes to heredocs)
- Run this skill after adding new commands or skills
- The commit skill does NOT auto-invoke this skill - run it explicitly
- Drift detection script: `./scripts/check-docs-drift.sh`
- Use `--verbose` flag on script for detailed output
</notes>
