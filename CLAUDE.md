# White Doe Inn Content (wdi-content)

Management tools and internal applications for White Doe Inn (Inspired Manteo Moments, Inc.).

## Tech Stack

- **Build**: Vite 7.x with TypeScript
- **Styling**: Tailwind CSS v4 + DaisyUI component library
- **Reactivity**: Alpine.js for lightweight interactivity
- **Charts**: Frappe Gantt for project timeline visualization

## Project Structure

```
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
│   └── create-project.js      # Interactive project creation CLI
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

## URL Structure

| Path | Description |
|------|-------------|
| `/` | Home page |
| `/projects/` | Projects listing |
| `/projects/{slug}/` | Individual project |
| `/public/{file}.html` | Static files |
| `/{file}.html` | Symlinks to public/ (backward compat) |

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
