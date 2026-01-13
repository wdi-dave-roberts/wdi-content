---
name: milestone
description: Create and manage milestones that group related features for delivery
argument-hint: "[name]"
---

# /wdi:milestone - Create Milestone

Group related features into a milestone that delivers value.

## Usage

```
/wdi:milestone [name]
```

## Workflow

### Step 1: Define the Milestone

Ask the user:

1. **What value does this deliver?** (1 sentence - what can the user do when this is done?)
2. **What features are needed?** (list them)

### Step 2: Validate Features

For each feature listed:
- Does it exist in `docs/product/planning/features/`?
- If not, note it needs to be created first

### Step 3: Determine Order

Ask: **What order should these be built?**

Consider dependencies — if Feature B needs Feature A's output, A comes first.

**Tip:** Enhanced-ralph will automatically resolve dependencies via topological sort, but explicit ordering helps documentation clarity.

### Step 4: Write Milestone File

Create `docs/product/planning/milestones/MILE-NNN-[name].md`:

```markdown
# MILE-NNN: [Name]

**Status:** Not Started
**Created:** [today's date]
**Target:** [target date if known]
**Completed:**
**Owner:** [owner name]

---

## Value Delivered
[1 sentence from Step 1]

## Scope

### What's Included
[Brief description]

### What's NOT Included
[Explicitly list deferrals]

---

## Features

| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 1 | [feature-a](../features/feature-a.md) | High | Planning |
| 2 | [feature-b](../features/feature-b.md) | High | Planning |
| 3 | [feature-c](../features/feature-c.md) | Medium | Planning |

### Feature Summary

**Critical (must ship):**
- feature-a - brief description
- feature-b - brief description

**Medium (nice to have):**
- feature-c - brief description

---

## Dependencies

### Milestone Dependencies

| Milestone | Reason | Status |
|-----------|--------|--------|
| MILE-001 | Foundation needed | Complete |

---

## Done When

- [ ] All features complete and tested
- [ ] [Specific criterion]
- [ ] Documentation updated

---

## Notes

[Decisions, context, lessons learned]

---

*Template: docs/templates/milestone.md*
```

### Step 5: Update Status

Add the new milestone to `docs/product/planning/status.md` if it exists.

## Example

```
/wdi:milestone config-context

→ What value does this deliver?
"User can see what settings produced their performance results"

→ What features are needed?
- config-snapshots (capture settings during export)
- config-timeline (visualize when settings changed)
- change-alerts (notify on significant changes)

→ Order?
1. config-snapshots (foundation - need data first)
2. config-timeline (display the data)
3. change-alerts (enhancement on top)

Generated: docs/product/planning/milestones/MILE-002-config-context.md
```

## Working Through a Milestone

### Option 1: Execute All Features (Recommended)

```bash
/wdi:enhanced-ralph --milestone MILE-002-config-context
```

This executes each feature in dependency order, updates status as it goes, and marks the milestone complete when done.

**Features:**
- Automatic dependency resolution (topological sort)
- Progress tracking ("Feature 1/3: ...")
- Status updates after each feature
- Resume from failure with `--continue`

### Option 2: Execute Features Individually

```bash
# Work on features one at a time
/wdi:enhanced-ralph config-snapshots
/wdi:enhanced-ralph config-timeline
/wdi:enhanced-ralph change-alerts
```

After each feature, manually update the milestone file status.

### Option 3: Execute with Flags

```bash
# Strict mode for critical milestones
/wdi:enhanced-ralph --milestone MILE-002 --strict

# Fast mode (skip optional reviews)
/wdi:enhanced-ralph --milestone MILE-002 --fast

# Resume after failure
/wdi:enhanced-ralph --milestone MILE-002 --continue

# Force execution despite incomplete dependencies
/wdi:enhanced-ralph --milestone MILE-002 --force
```

No sprints. No velocity. Just: pick next feature, loop until done, repeat.

## Milestone Numbering

Use sequential numbering with descriptive slugs:
- `MILE-001-foundation`
- `MILE-002-config-context`
- `MILE-003-analytics-dashboard`

Check existing milestones to determine the next number:
```bash
ls docs/product/planning/milestones/
```

## Milestone Status Values

| Status | Meaning |
|--------|---------|
| `Not Started` | Milestone created but no work begun |
| `Planning` | Finalizing features and dependencies |
| `In Progress` | At least one feature being worked on |
| `Blocked` | Cannot proceed due to dependency |
| `Complete` | All features done, milestone delivered |
