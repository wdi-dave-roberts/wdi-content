# Standards Dependency Map

Quick reference for which files depend on each standard. Used by:
- `/wdi:update-standard` command
- `scripts/pre-tool-standards-check.sh` hook
- `scripts/validate-dependency-map.sh` validation

---

## How to Read This Map

- **Enforced by**: Commands that implement validation/logic based on this standard (must update code)
- **Referenced by**: Documentation that mentions this standard (may need text updates)
- **Impact score**: Total number of files affected by changes to this standard

### Meta Files (Reference ALL Standards)

These files reference all standards by design and don't need updating for individual standard changes:
- `commands/update-standard.md` - The update command itself
- `docs/standards/STANDARDS-UPDATE-PROTOCOL.md` - Protocol documentation
- `knowledge/standards-dependency-map.md` - This file
- `README.md` - Standards index table (update only when adding/removing standards)
- `CLAUDE.md` - Standards index table (update only when adding/removing standards)

---

## REPO-STANDARDS.md

**Enforced by:**
- commands/check-standards.md (repository name validation)
- commands/new-repo.md (naming proposal logic)
- scripts/check-deps.sh (deprecation warning for wdi- prefix)

**Referenced by:**
- knowledge/standards-summary.md (repo naming quick reference)
- docs/standards/PROJECT-STRUCTURE.md (links to naming)
- docs/standards/FILE-NAMING.md (links to naming)

**Impact score:** 6 files

---

## BRANCH-NAMING.md

**Enforced by:**
- skills/commit/SKILL.md (branch validation step)
- commands/check-standards.md (branch name check)

**Referenced by:**
- knowledge/standards-summary.md (branch naming quick reference)

**Impact score:** 3 files

---

## COMMIT-STANDARDS.md

**Enforced by:**
- skills/commit/SKILL.md (message generation and format)
- commands/check-standards.md (commit format validation)

**Referenced by:**
- knowledge/standards-summary.md (commit message quick reference)

**Impact score:** 3 files

---

## PROJECT-STRUCTURE.md

**Enforced by:**
- commands/feature.md (directory creation, docs/product layout)
- commands/check-standards.md (structure validation)
- commands/new-repo.md (structure templates)
- commands/new-subproject.md (package structure)

**Referenced by:**
- knowledge/standards-summary.md (project structure quick reference)
- docs/templates/feature.md (notes section)

**Impact score:** 6 files

---

## FILE-NAMING.md

**Enforced by:**
- commands/new-subproject.md (package naming conventions)
- commands/check-standards.md (file name checks)

**Referenced by:**
- knowledge/standards-summary.md (file naming quick reference)

**Impact score:** 3 files

---

## CLAUDE-CODE-STANDARDS.md

**Enforced by:**
- commands/check-standards.md (plugin validation)
- commands/setup.md (dependency and naming check)
- commands/new-command.md (command naming convention enforcement)
- install.sh (CLAUDE.md template with command listings)

**Referenced by:**
- CLAUDE.md (command listing and conventions)
- README.md (key conventions section)
- knowledge/standards-summary.md (commands quick reference)

**Impact score:** 7 files

**Note:** When adding new commands, update install.sh CLAUDE.md template and output.

---

## ISSUE-STANDARDS.md

**Enforced by:**
- commands/feature.md (issue creation format)

**Referenced by:**
- .github/ISSUE_TEMPLATE/bug_report.md (follows template)
- .github/ISSUE_TEMPLATE/feature_request.md (follows template)
- .github/ISSUE_TEMPLATE/enhancement.md (follows template)
- knowledge/standards-summary.md (issues quick reference)

**Impact score:** 5 files

---

## DEPENDENCY-STANDARDS.md

**Enforced by:**
- docs/templates/milestone.md (dependency tables format)
- docs/templates/feature.md (dependency section format)

**Referenced by:**
- knowledge/standards-summary.md (dependencies quick reference)

**Impact score:** 3 files

---

## Impact Summary

| Standard | Impact Score | Complexity |
|----------|--------------|------------|
| CLAUDE-CODE-STANDARDS.md | 7 | High |
| PROJECT-STRUCTURE.md | 6 | High |
| REPO-STANDARDS.md | 6 | High |
| ISSUE-STANDARDS.md | 5 | Moderate |
| BRANCH-NAMING.md | 3 | Simple |
| COMMIT-STANDARDS.md | 3 | Simple |
| FILE-NAMING.md | 3 | Simple |
| DEPENDENCY-STANDARDS.md | 3 | Simple |

**Complexity levels:**
- **Simple** (3 files or less): Quick update, minimal risk
- **Moderate** (4-5 files): Plan for testing after update
- **High** (6+ files): Consider impact carefully before changing

---

## Maintenance

When adding a new standard:
1. Add a section to this map following the format above
2. Register the standard in the update-standard command
3. Add to knowledge/standards-summary.md

When changing a standard:
1. Run `/wdi:update-standard --analyze STANDARD-NAME`
2. Review impact before proceeding
3. Use `/wdi:update-standard STANDARD-NAME` for guided updates
