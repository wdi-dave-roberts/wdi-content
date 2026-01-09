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
