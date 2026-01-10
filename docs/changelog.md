# Changelog

## 2026-01-09

### Added
- **Native /new-project command** - Rewrote project creation as native Claude command with AskUserQuestion prompts instead of npm CLI wrapper
  - Flags: `--yes`, `--template`, `--dry-run`
  - Pausepoint confirmation before file creation
  - Comprehensive examples and error handling docs
- **deck-addition project** - Test project created to validate new command workflow
- **Feature planning system** - Added `plans/` directory for feature implementation plans

### Changed
- Moved `/new-project` from `.claude/skills/` to `.claude/commands/`
- Command now references `_templates/` instead of duplicating HTML

### Removed
- `.claude/skills/new-project.md` thin wrapper (replaced by native command)
