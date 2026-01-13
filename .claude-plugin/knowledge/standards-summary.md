# WDI Standards Quick Reference

Quick lookup for all development standards. For full details, see `docs/standards/`.

---

## Repository Naming

| Type | Pattern | Example |
|------|---------|---------|
| Mono-repo | `{cluster}-ops` | `marketing-ops`, `business-ops` |
| Plugin repo | `dev-plugins-{domain}` | `dev-plugins-workflow` |
| Knowledge | `knowledge-base` | `knowledge-base` |

**No `wdi-` prefix on repos** - the org name provides context.

---

## Claude Code Commands

| Pattern | Example |
|---------|---------|
| `/wdi-{domain}:{command}` | `/wdi-workflow:commit` |

**Use `wdi-` prefix on commands** - prevents conflicts with third-party.

---

## Branch Naming

```
{type}/{identifier}-{description}
```

| Type | Example |
|------|---------|
| `feature/` | `feature/FEAT-123-add-login` |
| `fix/` | `fix/456-null-pointer` |
| `hotfix/` | `hotfix/auth-bypass` |
| `docs/` | `docs/update-readme` |
| `experiment/` | `experiment/try-graphql` |

---

## Commit Messages

```
{type}: {Description}
```

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code restructure |
| `chore` | Maintenance |

---

## File Naming

| Type | Pattern |
|------|---------|
| Directories | `lowercase-hyphen` |
| Python | `snake_case.py` |
| JavaScript | `camelCase.js` |
| Shell | `kebab-case.sh` |
| Markdown | `UPPERCASE.md` or `lowercase.md` |

---

## Project Structure

### Mono-repo

```
repo/
├── packages/{name}/
├── shared/
├── docs/
└── scripts/
```

### Standalone

```
repo/
├── src/
├── tests/
├── docs/
└── scripts/
```

### Claude Code Plugin

```
repo/
├── .claude-plugin/
├── commands/
├── hooks/
├── scripts/
├── docs/
└── knowledge/
```

---

## Required Files

| All Projects | Claude Code Projects |
|--------------|---------------------|
| `README.md` | `CLAUDE.md` |
| `.gitignore` | `commands/*.md` |
| `docs/changelog.md` | `install.sh` |

---

## GitHub Issues

**Labels (required - pick one):**
- `bug` - Something broken
- `feature` - New functionality
- `enhancement` - Improve existing
- `documentation` - Docs only
- `experiment` - Exploratory work

**Title format:** Sentence case, brief, descriptive
- Good: `Add dark mode toggle to settings`
- Bad: `[BUG] [URGENT] Fix the thing`

**Linking:** Branch includes issue number → `fix/123-mobile-nav`

---

## Dependencies

**Technical Types:**
- `External` - Third-party API/service
- `Internal` - Another feature/milestone
- `Package` - Library dependency
- `Infrastructure` - Environment/platform
- `Data` - Migration/data availability

**Non-Technical Types:**
- `Maintenance` - Scheduled downtime
- `Personnel` - Team availability
- `Approval` - Sign-off required
- `Vendor` - External company
- `Event` - Deadline/demo
- `Resource` - Hardware/budget

**Status:** Available, Pending, In Progress, Blocked, At Risk, N/A

**Relationships:** Blocked by, Blocks, Depends on, Related to

---

## Updating Standards

When changing any standard, use the update protocol:

```bash
# See impact before making changes
/wdi:update-standard --analyze <STANDARD>

# Guided update workflow
/wdi:update-standard <STANDARD>

# List all standards with impact scores
/wdi:update-standard --list
```

See: `docs/standards/STANDARDS-UPDATE-PROTOCOL.md`
Dependencies: `knowledge/standards-dependency-map.md`

---

## Decision Quick Checks

**New project?**
→ Does it belong in existing cluster? → Add to mono-repo
→ Is it a plugin? → Standalone repo
→ New domain? → New cluster mono-repo

**New feature?**
→ Create branch: `feature/FEAT-XXX-description`
→ Commits: `feat: Description`
→ PR: Link to issue

**Changing a standard?**
→ Run `--analyze` first to see impact
→ Use guided workflow to update all dependents
→ Commit all changes together
