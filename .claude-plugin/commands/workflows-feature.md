---
description: Full feature workflow with research, planning, implementation, and review (project)
---

# /wdi:feature - Compound Engineering Feature Workflow

Full feature development workflow using an interview-driven approach to tailor research, planning, and review phases.

## Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--yes` | `-y` | Auto-continue through phases (no pauses) |
| `--plan` | | Stop after planning phase |
| `--idea` | | Quick idea capture mode (minimal structure, no implementation) |

### Aliases (backwards compatibility)

| Alias | Maps to |
|-------|---------|
| `--plan-only` | `--plan` |

---

## Workflow Overview

### Full Workflow (default)
```
Interview → Pre-flight → Research → Plan → Work → Review → Compound
```

Each phase pauses for approval unless `--yes` is passed.

### Idea Mode (`--idea`)
```
Quick Interview → Create Idea File → Create Draft Issue → Done
```

Use idea mode when you have an idea but aren't ready to implement. Creates a lightweight idea spec and draft GitHub issue for later triage.

---

## Idea Mode

When `--idea` flag is passed, run this simplified workflow instead of the full workflow.

### Step 1: Quick Interview

Use `AskUserQuestion` to gather minimal context.

#### Question 1: Idea Title

```
What's the idea? (short title)
```
(Free text - becomes the idea title and issue title)

#### Question 2: Problem Statement

```
What problem does this solve or what opportunity does it address?
```
(Free text - the "why" behind the idea)

#### Question 3: Appetite

```
How much time would this be worth?
```

| Option | Description |
|--------|-------------|
| **Small** | Hours to days - quick win |
| **Medium** | 1-2 weeks - meaningful feature |
| **Big** | 3-6 weeks - significant undertaking |
| **Unknown** | Need research to estimate |

#### Question 4: Rough Solution (Optional)

```
Any initial thoughts on approach? (leave blank if none)
```
(Free text - optional early thinking)

#### Question 5: Open Questions

```
What questions need answers before this can be built?
```
(Free text - captures unknowns)

### Step 2: Create Idea File

Create idea file from template:

1. Read template from `docs/templates/idea.md`
2. Generate slug from title (lowercase, hyphens)
3. Fill in placeholders from interview
4. Save to `docs/product/ideas/{slug}.md`

Create directories if needed:
```bash
mkdir -p docs/product/ideas
```

### Step 3: Create Draft GitHub Issue

```bash
gh issue create \
  --title "Idea: {title}" \
  --label "status:idea" \
  --body "$(cat <<'EOF'
## Problem

{problem-statement}

## Appetite

{appetite}

## Rough Solution

{rough-solution or "TBD - needs shaping"}

## Open Questions

{open-questions}

---

**Spec:** `docs/product/ideas/{slug}.md`
**Status:** Idea - not ready for implementation

*Captured by `/wdi:feature --idea`*
EOF
)"
```

If `status:idea` label doesn't exist, create it:
```bash
gh label create "status:idea" --color "FBCA04" --description "Raw idea, needs shaping" 2>/dev/null || true
```

### Step 4: Output

```
Idea Captured
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: {title}
Appetite: {appetite}

✓ Created: docs/product/ideas/{slug}.md
✓ Issue: #{issue-number} (status:idea)

Next steps:
• Shape the idea when ready: research feasibility, define approach
• Promote to feature: /wdi:feature @docs/product/ideas/{slug}.md
• Or close the issue if the idea doesn't pan out
```

**Exit after idea mode - do not continue to full workflow.**

---

## Promoting Ideas to Features

When an idea is ready for implementation, run the feature workflow with the idea file:

```
/wdi:feature @docs/product/ideas/{slug}.md
```

The workflow will:
1. Read the idea file and extract problem/appetite/questions
2. Pre-populate interview answers from the idea
3. Run full research → plan → work → review → compound workflow
4. Move the file from `docs/product/ideas/` to `docs/product/planning/features/`
5. Update the GitHub issue labels: `status:idea` → `status:in-progress`

---

## Phase 1: Interview

Use `AskUserQuestion` to gather context. Complexity and target subproject are assessed by Claude after research, not asked upfront.

#### Question 1: Feature Type

```
What type of work is this?
```

| Option | Description |
|--------|-------------|
| **New Feature** | Adding new functionality that doesn't exist |
| **Enhancement** | Improving or extending existing functionality |
| **Bug Fix** | Fixing broken or incorrect behavior |
| **Refactor** | Restructuring code without changing behavior |
| **Experiment** | Exploratory work, spike, or proof of concept |

#### Question 2: Research Preference

```
How much research should we do?
```

| Option | Description |
|--------|-------------|
| **Full Research** | Run all relevant agents (recommended for unfamiliar areas) |
| **Light Research** | Quick codebase scan only |
| **Skip Research** | Go straight to planning (you know the codebase well) |

#### Question 3: Feature Description

```
Briefly describe the feature or work:
```
(Free text - used for research queries and issue creation. If a feature spec file was provided via `@file`, extract the description from it instead of asking.)

---

## Phase 2: Pre-flight Checks

Quick validation before starting work.

### Check 1: Repository Context

```bash
# Detect repository type
if [ -d "packages" ]; then
  TYPE="mono-repo"
elif [ -d ".claude-plugin" ]; then
  TYPE="plugin"
else
  TYPE="standalone"
fi
```

Confirm we're in the right repository for this work.

### Check 2: Branch Status

- Not on `main` with uncommitted changes
- Clean working tree (or offer to stash)

### Check 3: Required Files

Quick check that essential files exist:
- README.md
- docs/changelog.md (or will be created)

### Check 4: Mono-repo Detection

Detect if this is a mono-repo for later subproject targeting:

```bash
if [ -d "packages" ]; then
  IS_MONOREPO=true
  # List existing subprojects for later suggestion
  ls packages/
fi
```

---

## Phase 3: Research (Adaptive)

Research depth determined by user preference. Complexity and target subproject are assessed after research.

### Agent Selection by Feature Type

| Feature Type | Full Research Agents | Light Research |
|--------------|---------------------|----------------|
| New Feature | repo-analyst, framework-docs, best-practices, git-history | repo-analyst |
| Enhancement | repo-analyst, git-history | repo-analyst |
| Bug Fix | repo-analyst, git-history | repo-analyst |
| Refactor | repo-analyst, git-history, best-practices | repo-analyst |
| Experiment | repo-analyst, best-practices | repo-analyst |

### Research Preference Effect

| Preference | Effect |
|------------|--------|
| Full Research | Use all agents from matrix above |
| Light Research | repo-analyst only |
| Skip Research | Skip to Phase 3.5 (Assessment) |

### Run Research Agents

Run selected agents in parallel using Task tool:

```
subagent_type='compound-engineering:research:repo-research-analyst'
subagent_type='compound-engineering:research:git-history-analyzer'
subagent_type='compound-engineering:research:framework-docs-researcher'
subagent_type='compound-engineering:research:best-practices-researcher'
```

Prompt each agent with:
- Feature description from interview (or from provided spec file)
- Feature type context

Ask for:
- Relevant existing patterns
- Files that will need modification
- Constraints or considerations
- Recommended approaches

### Synthesize Research

Combine agent outputs into a research summary:
- Key findings
- Existing patterns to follow
- Files to modify
- Constraints identified

---

## Phase 3.5: Assessment (Claude Suggests, User Confirms)

After research, Claude assesses complexity and target subproject based on findings.

### Complexity Assessment

Analyze the feature and research findings to determine complexity:

| Signal | Simple | Moderate | Complex |
|--------|--------|----------|---------|
| Files affected | 1-2 | 3-10 | 10+ |
| New abstractions | None | 1-2 | New patterns/systems |
| External deps | None | Existing only | New dependencies |
| Architectural impact | None | Local | System-wide |
| Existing patterns | Clear match | Partial match | Greenfield |

**Complexity determines:**
- Planning depth (Phase 4)
- Review agents (Phase 6)
- Merge strategy (Phase 7)

### Target Subproject (Mono-repos Only)

If `IS_MONOREPO=true`, suggest target subproject based on:
- Feature description keywords
- Files identified in research
- Existing subproject purposes

**Present selectable list:**

```
Which subproject does this affect?

Based on the feature description and research, this appears to
affect: packages/api-ga4
  • Feature mentions "GA4 reporting"
  • Related files found in packages/api-ga4/src/

Existing subprojects:
  [1] api-ga4 (Recommended)
  [2] api-mailchimp
  [3] dashboard
  [4] lib-auth
  [5] New Subproject (create first)
  [6] Repo-Level (root scripts, docs, CI)

Select option or press Enter to accept recommendation:
```

**If "New Subproject" selected:**

```
Creating new subproject first...
```

Invoke `/wdi:new-subproject` workflow, then continue with the new subproject as target.

### Pause (unless --yes)

```
Assessment Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Feature Type: {type}
Complexity: {assessed-complexity}
Target: {subproject or "repo-level"}

Agents run: [list agents]

Key findings:
• [finding 1]
• [finding 2]

Continue to planning? (y)es, (a)bort:
```

---

## Phase 4: Plan

### Planning Depth by Complexity

| Complexity | Planning Approach |
|------------|-------------------|
| Simple | Quick bullet-point plan, minimal overhead |
| Moderate | Structured plan with acceptance criteria |
| Complex | Detailed plan with architecture diagrams, risk assessment |
| Unknown | Start with exploration tasks, then refine |

### Invoke Planning Workflow

Use Skill tool:

```
/compound-engineering:workflows:plan
```

Pass research context and interview answers.

### Generate Implementation Plan

The plan should include:
- **Requirements**: What the feature must do
- **Acceptance Criteria**: How to verify completion
- **Implementation Steps**: Ordered list of tasks
- **Files to Modify/Create**: Specific paths
- **Risks & Considerations**: What could go wrong (for complex work)

### Create GitHub Issue

```bash
gh issue create --title "{type}: {feature-name}" --body "$(cat <<'EOF'
## Overview

**Type:** {feature-type}
**Complexity:** {complexity}
**Target:** {package or repo-level}

## Requirements
{requirements}

## Acceptance Criteria
- [ ] {criterion 1}
- [ ] {criterion 2}

## Implementation Plan
{steps}

## Files
- `{file1}` - {description}
- `{file2}` - {description}

## Research Summary
{key findings from research phase}

---
Generated by /wdi:feature
EOF
)"
```

### Save Feature Spec

Create feature specification using template:

1. Read template from `docs/templates/feature.md`
2. Fill in placeholders from interview and research
3. Save to `docs/product/planning/features/{feature-slug}.md`

Create directories if needed:
```bash
mkdir -p docs/product/planning/features
```

### Pause (unless --yes)

```
Plan Phase Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Created: Issue #{issue-number}
Feature: docs/product/planning/features/{feature-slug}.md

Review the plan and continue to work? (y)es, (e)dit plan, (a)bort:
```

If `--plan`, stop here.

---

## Phase 5: Work

### Create Feature Branch

Branch naming based on feature type:

| Type | Branch Pattern |
|------|----------------|
| New Feature | `feature/{slug}` |
| Enhancement | `feature/{slug}` |
| Bug Fix | `fix/{issue-number}-{slug}` |
| Refactor | `refactor/{slug}` |
| Experiment | `experiment/{slug}` |

```bash
git checkout -b {branch-pattern}
```

### Invoke Work Workflow

Use Skill tool:

```
/compound-engineering:workflows:work
```

Pass the implementation plan from Phase 4.

### Execute Implementation

For each implementation step:
1. Add to TodoWrite as `in_progress`
2. Implement the step
3. Mark as `completed`
4. Move to next step

### Run Tests

```bash
# Detect and run appropriate tests
npm test      # if package.json exists
pytest        # if Python files changed
npm run build # if build script exists
```

If tests fail, fix issues before continuing.

### Pause (unless --yes)

```
Work Phase Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch: {branch}
Commits: {count}
Tests: ✓ passing

Ready for review? (y)es, (c)ontinue working, (a)bort:
```

---

## Phase 6: Review (Adaptive)

Review agents selected based on feature type and complexity.

### Agent Selection Matrix

| Feature Type | Complexity | Review Agents |
|--------------|------------|---------------|
| New Feature | Complex | simplicity, architecture, security, performance |
| New Feature | Moderate | simplicity, architecture |
| New Feature | Simple | simplicity |
| Enhancement | Any | simplicity, architecture |
| Bug Fix | Any | simplicity, security |
| Refactor | Any | simplicity, architecture, performance |
| Experiment | Any | simplicity only (light review) |

### Run Review Agents

| Agent | Focus |
|-------|-------|
| `code-simplicity-reviewer` | YAGNI, over-engineering, unnecessary abstraction |
| `architecture-strategist` | Design patterns, consistency with codebase |
| `security-sentinel` | Security vulnerabilities, input validation |
| `performance-oracle` | Performance issues, inefficient patterns |

### Present Findings

For each finding:
```
[Agent]: {issue description}

File: {file}:{line}
Severity: {low|medium|high}

(f)ix, (a)cknowledge, (s)kip:
```

- **fix**: Apply suggested fix
- **acknowledge**: Note the issue but continue
- **skip**: Ignore this finding

### Pause (unless --yes)

```
Review Phase Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Findings: {count} total
  ✓ Fixed: {fixed}
  ○ Acknowledged: {acknowledged}
  - Skipped: {skipped}

Merge and compound? (y)es, (r)eview again, (a)bort:
```

---

## Phase 7: Compound

### Merge Strategy by Complexity

| Complexity | Strategy |
|------------|----------|
| Simple | Direct merge to main |
| Moderate | Direct merge with detailed message |
| Complex | Create PR for record-keeping |

**Direct merge:**
```bash
git checkout main
git pull
git merge --no-ff {branch} -m "Merge {branch}"
```

**Create PR:**
```bash
gh pr create --title "{type}: {feature-name}" --body "{plan-summary}"
```

### Update Changelog

Use the commit skill (say "commit these changes --yes"):

The commit skill automatically updates `docs/changelog.md` with the feature entry.

### Invoke Compound Workflow

Use Skill tool:

```
/compound-engineering:workflows:compound
```

### Document Learnings

Capture what was learned:
- Patterns that worked well
- Things to do differently
- New conventions to adopt

**For Complex features:** Update `CLAUDE.md` with new patterns if significant.

### Update Feature Spec

Mark the feature specification as complete:

1. Locate the feature spec file at `docs/product/planning/features/{feature-slug}.md`
2. Update status: `**Status:** In Progress` → `**Status:** Complete`
3. Mark all "Done When" checkboxes: `- [ ]` → `- [x]`

```markdown
# Before
**Status:** In Progress
- [ ] Criterion 1
- [ ] Criterion 2

# After
**Status:** Complete
- [x] Criterion 1
- [x] Criterion 2
```

Include the spec update in the final commit before pushing.

### Cleanup

```bash
git branch -d {branch}
git push origin --delete {branch}  # if pushed
```

### Close Issue

```bash
gh issue close {issue-number} --comment "Completed in {commit-sha}"
```

### Final Output

```
Feature Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Feature Type: {type}
Complexity: {complexity}
Target: {package}

✓ Issue #{issue-number} closed
✓ Merged to main
✓ Changelog updated
✓ Feature spec marked complete
✓ Learnings documented

Research agents used: {list}
Review agents used: {list}

Learnings:
• {learning 1}
• {learning 2}
```

---

## Examples

### New complex feature (full workflow)

```
/wdi:feature

? What type of work is this?
  → New Feature

? How much research should we do?
  → Full Research

? Briefly describe the feature:
  → "Add real-time analytics dashboard with live updating charts"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pre-flight: ✓ All checks passed
  Mono-repo detected: packages/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

→ Research Phase
  Running: repo-analyst, framework-docs, best-practices, git-history

  Key findings:
  • Existing Chart.js integration in packages/dashboard
  • WebSocket support available via existing lib-ws
  • Similar pattern in guest-portal for live updates

→ Assessment Phase
  Complexity: Complex (10+ files, new WebSocket patterns)

  Target subproject: packages/dashboard
    • Feature mentions "dashboard"
    • Chart.js already integrated there

  Existing subprojects:
    [1] dashboard (Recommended)
    [2] api-ga4
    [3] lib-ws
    [4] New Subproject
    [5] Repo-Level

  ? Select [1]: ↵

  Continue to planning? [y]

→ Plan Phase
  Created: Issue #23 "New Feature: Real-time analytics dashboard"
  Plan: docs/product/planning/features/realtime-analytics.md

  Continue to work? [y]

→ Work Phase
  Branch: feature/realtime-analytics
  ✓ Created WebSocket connection hook
  ✓ Built LiveChart component
  ✓ Integrated with existing dashboard
  Tests: ✓ passing

  Ready for review? [y]

→ Review Phase
  simplicity-reviewer: ✓ Clean
  architecture-strategist: ✓ Follows existing patterns
  security-sentinel: ✓ WebSocket auth validated
  performance-oracle: 1 suggestion (debounce updates)

  (f)ix performance suggestion? [y]

  Merge and compound? [y]

→ Compound Phase
  ✓ Merged to main
  ✓ Issue #23 closed
  ✓ Changelog updated

  Learnings:
  • lib-ws handles reconnection automatically
  • Chart.js streaming plugin simplifies live updates

✓ Feature complete
```

### Quick bug fix

```
/wdi:feature

? What type of work is this?
  → Bug Fix

? How much research should we do?
  → Light Research

? Briefly describe the feature:
  → "Fix navigation links not highlighting on mobile"

→ Research Phase
  Running: repo-analyst only
  Found: Navigation in src/components/Nav.tsx

→ Assessment Phase
  Complexity: Simple (1 file, CSS fix)
  Target: Repo-Level (standalone repo)

  Continue to planning? [y]

→ Plan Phase
  Created: Issue #24 "Bug Fix: Mobile nav highlighting"

→ Work Phase
  Branch: fix/24-mobile-nav
  ✓ Fixed CSS media query
  Tests: ✓ passing

→ Review Phase
  simplicity-reviewer: ✓ Clean
  security-sentinel: ✓ No issues

→ Compound Phase
  ✓ Merged, closed, documented

✓ Bug fix complete
```

### Enhancement with feature spec provided

```
/wdi:feature @docs/product/planning/features/dark-mode.md

? What type of work is this?
  → Enhancement

? How much research should we do?
  → Full Research

  (Description extracted from spec: "Add dark mode support across all pages")

→ Research Phase
  Running: repo-analyst, framework-docs, best-practices, git-history

  Key findings:
  • DaisyUI supports data-theme attribute
  • 15 pages need theme-aware styling
  • LocalStorage can persist preference

→ Assessment Phase
  Complexity: Moderate (15 files, existing pattern in DaisyUI)
  Target: Repo-Level (affects multiple areas)

  Continue to planning? [y]

→ Plan Phase
  Updated: docs/product/planning/features/dark-mode.md
  Created: Issue #25 "Enhancement: Dark mode support"

  Continue to work? [y]

...
```

### New subproject creation during workflow

```
/wdi:feature

? What type of work is this?
  → New Feature

? How much research should we do?
  → Light Research

? Briefly describe the feature:
  → "Add Stripe payment processing integration"

→ Research Phase
  Running: repo-analyst only
  No existing Stripe integration found.

→ Assessment Phase
  Complexity: Moderate (new integration, existing patterns for APIs)

  Target subproject: (no clear match)
    • Feature requires new API wrapper

  Existing subprojects:
    [1] api-ga4
    [2] api-mailchimp
    [3] dashboard
    [4] New Subproject (Recommended)
    [5] Repo-Level

  ? Select [4]: ↵

  Creating new subproject first...
  → Running /wdi:new-subproject

  ? What type of subproject is this?
    → API Wrapper
  ? Which external service?
    → stripe

  ✓ Created: packages/api-stripe/

  Continuing with target: packages/api-stripe

→ Plan Phase
  ...
```

### Experiment with minimal overhead

```
/wdi:feature --yes

? What type of work is this?
  → Experiment

? How much research should we do?
  → Skip Research

? Briefly describe the feature:
  → "Test GraphQL subscriptions for live data"

→ Assessment Phase (skip research)
  Complexity: Simple (experiment)
  Target: Repo-Level

→ Light planning (experiment)
→ Branch: experiment/graphql-subscriptions
→ Light review (simplicity only)
→ Merged to main

✓ Experiment complete

Note: Experiment branches can be deleted after 90 days
if not promoted to permanent feature.
```

---

## Notes

- Interview answers determine agent selection and planning depth
- Complex work gets more research and review agents
- Simple work uses minimal overhead
- Experiments get light treatment (exploratory by nature)
- Use `--yes` for experienced users who know the codebase
- All phases can be aborted without side effects (except created branches/issues)
- Requires compound-engineering plugin for research and review agents
- Requires `gh` CLI authenticated for issue creation
- Feature specs use template from `docs/templates/feature.md`
- Feature specs saved to `docs/product/planning/features/`
- See PROJECT-STRUCTURE.md for full product documentation layout
