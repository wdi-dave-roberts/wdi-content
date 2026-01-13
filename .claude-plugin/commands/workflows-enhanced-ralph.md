---
name: enhanced-ralph
description: Quality-gated feature execution with research agents and type-specific reviews
argument-hint: "[feature-name] or --milestone [milestone-name]"
---

# Enhanced Ralph Loop

Execute feature specs with intelligent quality gates and agent support.

**Replaces direct ralph-loop invocation with structured quality enforcement.**

## Usage

```
/wdi:enhanced-ralph [feature-name]              # Standard execution
/wdi:enhanced-ralph [feature-name] --strict     # Fail on any quality issue
/wdi:enhanced-ralph [feature-name] --fast       # Skip optional reviews, keep security
/wdi:enhanced-ralph [feature-name] --skip-gates # Skip all quality gates
/wdi:enhanced-ralph [feature-name] --continue   # Resume from last incomplete task
/wdi:enhanced-ralph --milestone [name]          # Execute all features in milestone
```

**Note:** `[feature-name]` resolves to `docs/product/planning/features/[feature-name].md`

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Parse feature spec                                           │
├─────────────────────────────────────────────────────────────────┤
│ 2. Detect task types (UI, database, security, API, etc.)        │
├─────────────────────────────────────────────────────────────────┤
│ 3. Execute ralph-loop with enhanced prompt                      │
│    └─ For each task:                                            │
│       a. Research phase (if needed)                             │
│       b. Implementation                                         │
│       c. Quality gate (type-specific review)                    │
│       d. Mark complete or iterate                               │
├─────────────────────────────────────────────────────────────────┤
│ 4. Final summary                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Parse Feature Spec

Read the feature file and extract:
- All tasks (checkbox items under "Done When")
- Dependencies
- Any UX/UI section
- Notes section for context

## Step 2: Detect Task Types

Analyze each task and tag with types based on keywords:

| Type | Detection Keywords |
|------|-------------------|
| `ui` | component, page, render, display, show, chart, modal, form, button, input |
| `database` | schema, migration, model, query, table, column, index, ActiveRecord |
| `api` | endpoint, route, controller, request, response, fetch, API |
| `security` | auth, permission, token, password, credential, encrypt, validate input |
| `data` | transform, parse, process, calculate, aggregate, filter |
| `test` | test, spec, coverage, assert, mock |
| `config` | env, config, setting, flag, option |
| `external` | OAuth, third-party, integration, external API |

A task can have multiple types. Example:
```
- [ ] Create user preferences API endpoint (test: returns saved preferences)
      → Types: [api, test]
```

### Explicit Task Annotations

Tasks can include explicit annotations that override auto-detection:

```markdown
- [ ] Add search terms API call (test: returns data) [research: external-api]
- [ ] Create auth middleware (test: blocks unauthorized) [review: security]
- [ ] Optimize data loading (test: <100ms) [review: performance]
- [ ] Simple rename (test: no errors) [skip-gates]
```

| Annotation | Effect |
|------------|--------|
| `[research: topic]` | Force research phase with specified topic |
| `[review: type]` | Force specific review gate (security, performance, simplicity) |
| `[skip-gates]` | Skip all gates for this task |
| `[strict]` | Fail on any issue for this task |

## Step 3: Execute with Quality Gates

Build an enhanced prompt for ralph-loop:

```
Complete the next unchecked task in [feature-file].

For each task:

1. RESEARCH PHASE (if needed):
   - For external APIs: Use framework-docs-researcher agent to gather docs
   - For new patterns: Use best-practices-researcher agent
   - For understanding existing code: Use git-history-analyzer agent

2. IMPLEMENTATION:
   - Follow existing codebase patterns
   - Keep changes minimal and focused

   If task has [ui] type:
   - Invoke frontend-design skill for high-quality component creation
   - Write the code with production-grade UI patterns

   Otherwise:
   - Write the code directly

3. QUALITY GATE (based on task type):

   If task has [ui] type:
   - Run playwright-test to verify component renders correctly
   - Invoke design-implementation-reviewer agent for visual review
   - Fix any issues before marking complete

   If task has [database] type:
   - Invoke data-integrity-guardian agent
   - Check migration safety, constraints, rollback

   If task has [security] type:
   - Invoke security-sentinel agent
   - Address any vulnerabilities before proceeding

   If task has [api] type:
   - Verify endpoint works with curl/test
   - Check error handling

   If task involves complex logic:
   - Invoke pattern-recognition-specialist agent
   - Ensure consistent patterns

4. VERIFY using the test criteria in parentheses

5. MARK COMPLETE only after quality gate passes

6. MOVE TO NEXT TASK
```

### UI Task Workflow (Enhanced)

UI tasks get special treatment with multiple skill/plugin integrations:

```
┌─────────────────────────────────────────────────────────────┐
│ UI TASK DETECTED                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. IMPLEMENTATION                                           │
│    └─ Invoke: frontend-design skill                         │
│       • Creates distinctive, production-grade UI            │
│       • Avoids generic AI aesthetics                        │
├─────────────────────────────────────────────────────────────┤
│ 2. BROWSER VERIFICATION                                     │
│    └─ Run: playwright-test                                  │
│       • Verify component renders without errors             │
│       • Check responsive behavior                           │
│       • Capture screenshot for review                       │
├─────────────────────────────────────────────────────────────┤
│ 3. DESIGN REVIEW                                            │
│    └─ Invoke: design-implementation-reviewer agent          │
│       • Verify UI matches spec                              │
│       • Check accessibility                                 │
│       • Identify visual issues                              │
├─────────────────────────────────────────────────────────────┤
│ 4. ITERATION (if review fails)                              │
│    └─ Option: design-iterator with N iterations             │
│       • Systematically refine until review passes           │
└─────────────────────────────────────────────────────────────┘
```

### Quality Gate Agent Mapping

| Task Type | Implementation Skill | Verification | Review Agent |
|-----------|---------------------|--------------|--------------|
| `ui` | `frontend-design` | `playwright-test` | `design-implementation-reviewer` |
| `database` | — | — | `data-integrity-guardian` |
| `security` | — | — | `security-sentinel` |
| `api` | — | curl/manual | — |
| Complex logic | — | — | `pattern-recognition-specialist` |

### File-Type Reviews (Post-Task)

After implementing a task, check which files were created/modified and trigger additional reviews:

| File Pattern | Agent | Trigger Condition |
|--------------|-------|-------------------|
| `*.tsx`, `*.ts` | `kieran-typescript-reviewer` | New component or >50 lines changed |
| `*.py` | `kieran-python-reviewer` | New module or >50 lines changed |
| `schema.prisma`, `migrations/*` | `data-integrity-guardian` | Any change |
| `**/auth/**`, `**/security/**` | `security-sentinel` | Any change |

**Logic:**
```
After task completion:
1. Get list of files created/modified
2. For each file matching patterns above:
   - If matches .tsx/.ts with significant changes → kieran-typescript-reviewer
   - If matches .py with significant changes → kieran-python-reviewer
   - If matches schema/migration → data-integrity-guardian (if not already run)
   - If in auth/security path → security-sentinel (if not already run)
3. Report findings before moving to next task
```

### Research Agent Triggers

| Situation | Agent |
|-----------|-------|
| External API | `framework-docs-researcher` |
| New pattern not in codebase | `best-practices-researcher` |
| Understanding why code exists | `git-history-analyzer` |
| Finding existing patterns | `repo-research-analyst` |

## Step 4: Execute Ralph Loop

Run ralph-loop with the enhanced prompt:

```
/ralph-loop:ralph-loop "[enhanced prompt from Step 3]" --max-iterations 25 --completion-promise "ALL TASKS COMPLETE"
```

Increased max-iterations to 25 to account for quality gate iterations.

## Step 5: Final Summary

After completion, output:

```
Feature Execution Summary
═════════════════════════
Feature: [name]
Tasks completed: X/Y

Quality Gates Run:
• design-implementation-reviewer: 2 tasks
• data-integrity-guardian: 1 task
• security-sentinel: 0 tasks

Research Performed:
• framework-docs-researcher: External API docs
• best-practices-researcher: Chart component patterns

Issues Found & Resolved:
• [ui] Missing aria-label on chart - fixed
• [database] Missing index on user_id - added

Ready to commit - say "commit these changes"
```

## Flags

| Flag | Effect |
|------|--------|
| `--strict` | Fail immediately if any quality gate finds issues (no auto-fix) |
| `--fast` | Skip optional reviews, keep security gates |
| `--skip-gates` | Skip quality gates entirely (fast mode, use for simple features) |
| `--continue` | Resume from last incomplete task |
| `--verbose` | Show detailed output from each agent |
| `--milestone` | Execute all features in a milestone file sequentially |
| `--force` | Proceed despite incomplete milestone dependencies |

---

## Milestone Mode

When invoked with `--milestone [milestone-name]`:

### Step M1: Parse Milestone File

Read `docs/product/planning/milestones/[milestone-name].md`:
- Extract Features table (ordered list with Status column)
- Filter to features where Status != Complete
- Build dependency graph from "Blocked by" sections in each feature

### Step M2: Resolve Dependencies

Apply topological sort (Kahn's algorithm):
1. Build directed graph: feature → features it blocks
2. Find features with no dependencies (start nodes)
3. Process in order, removing satisfied dependencies
4. Detect cycles and error if found

```
Dependency Resolution
═════════════════════
Milestone: MILE-002-config-context
Features listed: C, A, B
Dependencies detected:
  • feature-a: (none)
  • feature-b: blocked by feature-a
  • feature-c: blocked by feature-b

Resolved order: A → B → C
```

**If cycle detected:**
```
⚠️  Circular dependency detected!
Cycle: feature-a → feature-c → feature-a

Cannot execute milestone. Fix dependencies and retry.
```

### Step M3: Check Milestone Dependencies

If milestone has "Milestone Dependencies" table:
- Read each dependent milestone
- Verify status is "Complete"
- If not complete: WARN and block (unless --force)

```
⚠️  Milestone Dependency Warning
═══════════════════════════════
MILE-002 depends on MILE-001 which is "In Progress" (not Complete).

Options:
1. Complete MILE-001 first
2. Run with --force to proceed anyway

/wdi:enhanced-ralph --milestone MILE-002 --force
```

### Step M4: Check Cross-Milestone Dependencies

For each feature in this milestone, check if it depends on features from other milestones:
- Parse "Blocked by" section
- If dependency is in another milestone, check that feature's status
- WARN if dependent feature is not Complete

```
⚠️  Cross-Milestone Dependency Detected
═══════════════════════════════════════
feature-b depends on feature-a which is in MILE-001.
feature-a status: Planning (not Complete)

Suggest completing MILE-001 first, or use --force to proceed.
```

### Step M5: Update Milestone Status

If milestone status is "Not Started" or "Planning":
- Update status to "In Progress"
- Save the file

### Step M6: Execute Features Sequentially

For each feature in dependency-resolved order (where Status != Complete):

1. Display progress:
   ```
   Feature 1/3: feature-a
   ═══════════════════════
   ```

2. Run enhanced-ralph on the feature (without --milestone flag)

3. On success:
   - Update feature Status in milestone file to "Complete"
   - Report: `✓ Completed feature-a`

4. On failure:
   - Report: `✗ Failed on feature-a`
   - Save state for --continue
   - STOP execution

### Step M7: Milestone Completion

After all features complete:
- Update milestone status to "Complete"
- Set Completed date to today

### Step M8: Summary

**All features complete:**
```
Milestone Execution Summary
═══════════════════════════
Milestone: MILE-002-config-context
Features completed: 3/3

✓ feature-a
✓ feature-b
✓ feature-c

Dependency order used: A → B → C
Status: Complete

Ready to commit - say "commit these changes"
```

**Stopped early (failure):**
```
Milestone Execution Summary
═══════════════════════════
Milestone: MILE-002-config-context
Features completed: 1/3

✓ feature-a
✗ feature-b (failed - security gate)
○ feature-c (not started)

Status: In Progress
Resume with: /wdi:enhanced-ralph --milestone MILE-002 --continue
```

---

## Examples

### Standard Execution

```
/wdi:enhanced-ralph user-preferences

Parsing feature spec...
─────────────────────
Found 5 tasks:
1. [ui, api] Create preferences API endpoint
2. [ui] Build settings panel component
3. [database] Add preferences table
4. [ui] Implement theme toggle
5. [test] Add integration tests

Starting enhanced ralph-loop...
Quality gates enabled: design-implementation-reviewer, data-integrity-guardian

[ralph-loop executes with quality gates]

Feature Execution Summary
═════════════════════════
Tasks completed: 5/5
Quality gates passed: 4
Issues auto-fixed: 2

Ready to commit - say "commit these changes"
```

### Fast Mode (Skip Gates)

```
/wdi:enhanced-ralph simple-fix --skip-gates

Parsing feature spec...
─────────────────────
Found 2 tasks (simple feature)
Skipping quality gates (--skip-gates)

[ralph-loop executes normally]

Tasks completed: 2/2
Ready to commit - say "commit these changes"
```

### Strict Mode

```
/wdi:enhanced-ralph auth-update --strict

Parsing feature spec...
─────────────────────
Found 3 tasks with [security] type
Running in STRICT mode - will fail on quality issues

[ralph-loop executes]

Task 2: Update password validation
Quality Gate: security-sentinel
─────────────────────────────────
⚠️  ISSUE: Password minimum length should be 12, not 8
⚠️  ISSUE: Missing rate limiting on auth endpoint

STRICT MODE: Stopping execution. Fix issues manually or re-run without --strict.
```

### Milestone Execution

```
/wdi:enhanced-ralph --milestone MILE-002-config-context

Parsing milestone...
───────────────────
Milestone: MILE-002-config-context
Features: 3 (0 complete, 3 pending)

Resolving dependencies...
Listed order: C, A, B
Resolved order: A → B → C

Updating milestone status to "In Progress"...

Feature 1/3: feature-a
═══════════════════════
[enhanced-ralph executes feature-a]
✓ Completed feature-a

Feature 2/3: feature-b
═══════════════════════
[enhanced-ralph executes feature-b]
✓ Completed feature-b

Feature 3/3: feature-c
═══════════════════════
[enhanced-ralph executes feature-c]
✓ Completed feature-c

Milestone Execution Summary
═══════════════════════════
Features completed: 3/3
Status: Complete

Ready to commit - say "commit these changes"
```

## Error Handling

### Review Finds Blocking Issue

If a review agent finds a blocking issue:

```
POST-TASK REVIEW: BLOCKING ISSUE
────────────────────────────────
security-sentinel found:
✗ SQL injection vulnerability in search parameter

Action required: Fix before proceeding

1. [Implement fix...]
2. [Re-run review...]
3. ✓ Issue resolved

Continuing to next task...
```

### Task Fails Verification

If test criteria fails:

1. Do NOT check the box
2. Analyze failure
3. Fix implementation
4. Re-verify
5. Check box only when passing

### Max Iterations Reached

If ralph-loop hits max iterations before completing:

```
⚠️  Max iterations (25) reached
Tasks completed: 3/5
Remaining: 2 tasks

Options:
1. Re-run with: /wdi:enhanced-ralph feature-name --continue
2. Complete remaining tasks manually
3. Split feature into smaller parts
```

## Principles

- **Quality over speed**: Gates add time but catch issues early
- **Type-aware**: Different tasks need different checks
- **Research-first**: Gather docs before implementing new patterns
- **Minimal intervention**: Auto-fix when possible, stop only when necessary
- **Fail fast in strict mode**: Surface issues immediately for critical features
- **Dependency-aware**: Execute features in correct order based on dependencies
