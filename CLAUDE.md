# White Doe Inn Content (wdi-content)

Management tools and internal applications for White Doe Inn (Inspired Manteo Moments, Inc.).

## Tech Stack

- **Build**: Vite 7.x with TypeScript
- **Styling**: Tailwind CSS v4 + DaisyUI component library
- **Reactivity**: Alpine.js for lightweight interactivity
- **Charts**: Frappe Gantt for project timeline visualization

## Project Structure

```
├── .github/
│   └── workflows/
│       └── deploy.yml         # Auto-deploy to GitHub Pages on push
├── index.html                 # Main landing page
├── public/                    # Static files (served as-is)
│   ├── expense-form.html      # Expense reimbursement form
│   └── expense-summary.html   # Expense report viewer
├── projects/                  # Document collections with custom presentation
│   ├── index.html             # Projects listing page
│   ├── _schema/               # Shared schemas
│   │   └── project-data.schema.json  # JSON Schema for data.json
│   ├── _templates/            # Project templates (not served)
│   │   ├── base/              # Minimal template
│   │   ├── gantt/             # Gantt chart + timeline
│   │   └── gallery/           # Document gallery
│   └── kitchen-remodel/       # Example project
│       ├── project.json       # Project manifest
│       ├── data.json          # Project data (tasks, vendors, receipts, notes)
│       ├── index.html         # Project page
│       └── reference/         # Documents, receipts
├── scripts/
│   ├── create-project.js      # Interactive project creation CLI
│   └── update-plugins.sh      # Re-vendor wdi plugin from source
└── src/
    ├── main.ts                # Entry point - initializes Alpine.js
    ├── style.css              # Tailwind + DaisyUI configuration
    ├── gantt.ts               # Gantt chart functionality
    └── types/
        └── project-data.d.ts  # TypeScript types for data.json
```

## Commands

```bash
npm run dev            # Start development server
npm run build          # TypeScript check + Vite production build
npm run preview        # Preview production build locally
npm run create-project # Create a new project (interactive CLI)
```

## Projects System

Projects are self-contained document collections with optional visualizations.

### Creating a New Project

```bash
npm run create-project
```

Or use the Claude Code skill: `/new-project`

The CLI prompts for:
- Project name and slug
- Description (optional)
- Template: `base`, `gantt`, or `gallery`
- Feature toggles

### Project Structure

Each project has:
- `project.json` - Manifest with name, template, features
- `index.html` - Main page (generated from template or custom)
- `reference/` - Documents, receipts, images
- `src/` (optional) - Project-specific TypeScript

### Templates

| Template | Description |
|----------|-------------|
| `base` | Navbar + document sidebar + empty content area |
| `gantt` | Timeline/Gantt chart with task tracking |
| `gallery` | Grid/list view of documents with previews |

### Auto-Discovery

Vite automatically discovers projects by scanning `projects/*/project.json`. No manual configuration needed after creating a project.

## Project Data Schema

Projects store structured data in `data.json` with a tag-based association system.

### Entities

| Entity | Required Fields | Description |
|--------|-----------------|-------------|
| `tasks` | id, name, start, end | Gantt tasks with dependencies, assignees, progress |
| `vendors` | id, name, type | Contractors, suppliers, utilities with contact info |
| `receipts` | id, vendor, date, amount | Financial records with `href` to source files |
| `notes` | id, created, content, tags | Journal entries associated via tags |
| `milestones` | id, name, date | Project milestones |
| `budget` | - | Budget totals and category tracking |

### Tag References

Tags link entities together using the pattern `{entity}:{id}`:
- `vendor:danny` - References vendor with id "danny"
- `task:demolition` - References task with id "demolition"
- `project` - Project-level tag (no id)

Example note with tags:
```json
{
  "id": "note-001",
  "content": "Danny confirmed start date",
  "tags": ["vendor:danny", "task:demolition"]
}
```

### Receipts and Files

Receipts store OCR-extracted metadata with `href` pointing to source files:
```json
{
  "id": "flooring-deposit",
  "vendor": "vendor:precision-flooring",
  "href": "reference/receipts/flooring/deposit-receipt.pdf",
  "date": "2026-01-02",
  "amount": 1500.00,
  "type": "payment",
  "status": "paid"
}
```

### TypeScript Types

Import types from `src/types/project-data.d.ts`:
```typescript
import type { ProjectData, Task, Vendor, Receipt, Note } from './types/project-data'
```

## Deployment

The site is hosted on GitHub Pages with automatic deployment on every push to `main`.

**Live site**: https://whitedoeinn.github.io/wdi-content/

### How It Works

1. Push to `main` triggers GitHub Actions workflow (`.github/workflows/deploy.yml`)
2. Build job runs `npm ci` + `npm run build` (~15 seconds)
3. Deploy job uploads `dist/` to GitHub Pages (~3-7 minutes)
4. Site is live

### Adding New Content

**Static HTML file** (standalone pages):
```bash
cp my-page.html public/
git add public/my-page.html && git commit -m "Add my-page" && git push
echo -e "Live at:\n  https://whitedoeinn.github.io/wdi-content/public/my-page.html"
```

**New project** (with Gantt, gallery, etc.):
```bash
npm run create-project
git add projects/my-project/ && git commit -m "Add my-project" && git push
echo -e "Live at:\n  https://whitedoeinn.github.io/wdi-content/projects/my-project/"
```

### Deployment Timeline

| Step | Duration |
|------|----------|
| Build | ~15 seconds |
| Deploy | 3-7 minutes |
| **Total** | ~4-8 minutes |

## URL Structure

### Local Development (http://localhost:5173/wdi-content/)

| Path | Description |
|------|-------------|
| `/` | Home page |
| `/projects/` | Projects listing |
| `/projects/{slug}/` | Individual project |
| `/public/{file}.html` | Static files |

### Production (https://whitedoeinn.github.io/wdi-content/)

| Path | Live URL |
|------|----------|
| `/` | https://whitedoeinn.github.io/wdi-content/ |
| `/projects/` | https://whitedoeinn.github.io/wdi-content/projects/ |
| `/projects/{slug}/` | https://whitedoeinn.github.io/wdi-content/projects/{slug}/ |
| `/public/{file}.html` | https://whitedoeinn.github.io/wdi-content/public/{file}.html |

## Development Notes

- **Auto-discovery**: Projects and public files are auto-discovered in `vite.config.ts`
- **Backward compatibility**: Symlinks at root point to `/public/` for existing URLs
- **Styling**: Most pages use DaisyUI; some (expense forms) use standalone CSS for print
- **Alpine.js**: Available globally via `window.Alpine`
- **Strict TypeScript**: Enabled with `noUnusedLocals`, `noUnusedParameters`

## Claude Code Workflows

This project uses the wdi-workflows and compound-engineering plugins for structured development.

### Workflow Commands

| Command | Description |
|---------|-------------|
| `/wdi-workflows:feature` | Full feature workflow (research → plan → work → review → compound) |
| `/wdi-workflows:enhanced-ralph` | Quality-gated feature execution with research agents and type-specific reviews |
| `/wdi-workflows:milestone` | Create and execute milestone-based feature groupings |
| `/wdi-workflows:setup` | Set up and verify plugin dependencies |

### Skills (Auto-Invoked)

| Trigger | Description |
|---------|-------------|
| "commit these changes" | Smart commit with tests, simplicity review, and changelog |

### Standards Commands

| Command | Description |
|---------|-------------|
| `/wdi-workflows:new-repo` | Create a new repository following naming and structure standards |
| `/wdi-workflows:new-subproject` | Add a new subproject to a mono-repo following standards |
| `/wdi-workflows:check-standards` | Validate current repository against development standards |
| `/wdi-workflows:update-standard` | Impact analysis and guided updates when changing standards |
| `/wdi-workflows:new-command` | Create a new command and update all dependent files |

### Project-Specific Commands

| Command | Description |
|---------|-------------|
| `/new-project` | Create a new project from template (supports `--yes`, `--template`, `--dry-run`) |

### /feature Workflow

Orchestrates the complete feature development cycle:

1. **Research** - Smart-selects research agents based on feature context
2. **Plan** - Creates GitHub Issue + local plan file with requirements
3. **Work** - Feature branch, implementation, tests
4. **Review** - Multi-agent code review (simplicity, architecture, security, performance)
5. **Compound** - Merge, changelog, document learnings

```bash
/feature Add dark mode toggle          # Full interactive workflow
/feature --yes Quick fix               # Auto-continue through phases
/feature --plan-only New dashboard     # Stop after planning
```

### Commit Skill

Smart commit with quality gates (say "commit these changes"):

1. Stage changes (interactive or all)
2. Run tests (pytest, npm test based on file types)
3. Simplicity review (catches over-engineering)
4. Generate commit message
5. Update changelog (`docs/changelog.md`)
6. Push

Supports flags: `--yes`, `--skip-tests`, `--skip-review`, `--summary`

### Plugins Required

- `wdi-workflows` - Standards, commit workflow, feature orchestration
- `compound-engineering` - Research, review, and workflow agents

To reinstall/update: `./install.sh` or `./install.sh update`

## Patterns & Learnings

Conventions discovered through development:

### Command Organization

| Location | Purpose |
|----------|---------|
| `.claude/commands/` | Native commands with full workflow specs |
| `.claude/skills/` | Thin wrappers or simple delegations |

Commands should include: Flags table, workflow steps with pausepoints, examples, error handling, and notes.

### Gantt Project Imports

Gantt projects must import from the **global** `/src/gantt.ts`, not a project-local path:

```javascript
// Correct - uses global gantt module
import { initGantt, setViewMode } from '/src/gantt.ts'
initGantt('#gantt', '/projects/{slug}/data.json')

// Wrong - Vite can't resolve project-local imports
import { initGantt } from './src/gantt.ts'  // Build error
```

### Command Spec Best Practices

From code review feedback:

- **Reference, don't duplicate**: Point to `_templates/` instead of copying HTML into specs
- **Document flags**: Even if none, include empty Flags section for consistency
- **Add pausepoints**: Show confirmation prompts between workflow steps
- **Include error handling**: Table of errors, causes, and resolutions
- **Expand examples**: Show full interactive flow, not just command invocation

## Kitchen Remodel Project

### Data Location
Main data file: `projects/kitchen-remodel/data.json`

### Data Structure
- **tasks**: Parent tasks with subtasks, dependencies, assignees, dates, materials
- **vendors**: Contractor/supplier contacts (referenced as `vendor:{id}`)
- **receipts**: Financial records with links to source files in `reference/`
- **issues**: Unified issues system (questions + auto-detected issues)
- **notes**: Journal entries (general notes, not issues)
- **milestones**: Project milestones
- **budget**: Budget totals and tracking

### Key Relationships
- Tasks reference vendors via `assignee: "vendor:{id}"`
- Subtasks inherit parent task's assignee/dates/status unless overridden
- `dependencies`: array of task/subtask IDs that must complete first
- `materialDependencies`: links tasks to required materials (inline or by ID)
- Issues linked to tasks via `relatedTask` field; appear in "Issues" sheet

### Task Statuses
- `scheduled` - Has dates, ready to work
- `in-progress` - Currently being worked on
- `complete` - Finished
- `needs-scheduled` - Needs dates assigned

### Master Spreadsheet

**Kitchen-Remodel-Tracker.xlsx** is the master task spreadsheet for the kitchen remodel project.

**Location in Google Drive**:
```
~/Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/Kitchen-Remodel-Tracker.xlsx
```

**Sheets**: Instructions, Schedule (dependency order), By Assignee, Tasks, Materials, Vendors, Issues (unprotected for responses)

> **Note**: Any other spreadsheets in the Kitchen Remodel folder (e.g., `task-tracker-sample.xlsx` in Weathertek subfolder, `Task Tracker - With Sample Data.gsheet`) are old test/experimentation files and can be removed.

### Export Script

`scripts/export-to-spreadsheet.js` regenerates the master spreadsheet from `data.json`:
- Outputs to `projects/kitchen-remodel/Kitchen-Remodel-Tracker.xlsx`
- Also generates `projects/kitchen-remodel/exports/*.csv`

**Run export**:
```bash
node scripts/export-to-spreadsheet.js
```

**Copy to Google Drive**:
```bash
cp projects/kitchen-remodel/Kitchen-Remodel-Tracker.xlsx ~/Google\ Drive/Shared\ drives/White\ Doe\ Inn/Operations/Building\ and\ Maintenance\ /Kitchen\ Remodel/
```

### Common Operations

**View a task**:
```bash
grep -A50 '"id": "task-id"' projects/kitchen-remodel/data.json
```

**List all tasks with status**:
```bash
grep -E '"(id|name|status)"' projects/kitchen-remodel/data.json | head -60
```

**Find tasks by assignee**:
```bash
grep -B2 -A5 '"assignee": "vendor:eliseo"' projects/kitchen-remodel/data.json
```

**Add a dependency**: Add task ID to the `dependencies` array of the dependent task

**Add an issue**: `npm run task issue` (interactive) - auto-detects assignee based on keywords

**List issues**: `npm run task issues` or `npm run task issues --all` (includes resolved)

**Filter by action**: `npm run task issues --action ASSIGN` (ASSIGN, SCHEDULE, ORDER, SPECIFY, TRACK, DECIDE)

**Run auto-detection**: `npm run task detect` - finds schedule conflicts, past-due items, etc.

**Dismiss an issue**: `npm run task dismiss <issue-id>` - acknowledge but hide

### Unified Issues System

Issues are categorized by action needed:

| Category | Action Question | Who |
|----------|-----------------|-----|
| ASSIGN | "What do I need to assign?" | Brandon |
| SCHEDULE | "What do I need to schedule?" | Brandon |
| ORDER | "What's ready to order?" | Tonia |
| SPECIFY | "What needs specs/quantity?" | Tonia |
| TRACK | "What needs delivery tracking?" | Tonia |
| DECIDE | "What decisions are needed?" | Varies |

### Process Issues Workflow

When you say **"process issues"** or **"process questions"**, Claude will:

1. **Import responses** from the Google Drive spreadsheet's "Issues" sheet
2. **Show each response** with:
   - The issue category and Brandon's response
   - Proposed changes (task assignments, material updates, dates, status changes)
   - Impact analysis (schedule conflicts, dependency issues, warnings)
3. **Ask for approval** - accept all, reject specific ones, or handle individually

**Example output:**
```
━━━ New Response ━━━
[ASSIGN] Who should install the doors?
A: "Danny"

Proposed Changes:
  • Set install-doors.assignee → vendor:danny

Impact: ✅ No conflicts

Accept all? Or review individually?
```

**Issue lifecycle:**
- `open` → Waiting for response in spreadsheet
- `answered` → Response imported, pending review
- `resolved` → Accepted and changes applied to data.json
- `dismissed` → User acknowledged but doesn't want action
- **Cleanup**: Resolved issues (status='resolved' + reviewStatus='accepted') are automatically removed during export

**Issue sources:**
- `manual` - Created manually via CLI
- `auto-lifecycle` - Generated based on task/material state
- `auto-detection` - Generated by detection rules (conflicts, past-due, etc.)

**Auto-generated issues:** Export (`npm run task export`) automatically creates issues for:
- Tasks missing dates/assignees based on status (task lifecycle rules)
- Materials missing required fields based on status (material lifecycle rules)
- Schedule conflicts, past-due items, unscheduled blockers (auto-detection)

**Scripts:**
- `scripts/import-responses.js` - Pulls responses from spreadsheet into data.json
- `scripts/batch-accept.js` - Accepts all answered issues (use with caution)
