---
description: Create a new project with interactive template selection (project)
---

# /new-project - Create New Project

Create a new White Doe Inn project with interactive prompts for name, template, and features.

## Usage

```
/new-project
/new-project [project-name]
/new-project --template gantt "My Project"
```

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Auto-accept defaults (first template, all default features) |
| `--template <name>` | Skip template selection (base, gantt, gallery) |
| `--dry-run` | Preview project structure without creating files |

---

## Workflow

### Step 1: Load Templates

Discover available templates:
```
Glob: projects/_templates/*/template.json
Read each to get: name, description, features
```

**Error handling**: If no templates found, abort with message: "No templates found in projects/_templates/"

### Step 2: Collect Project Details

Use AskUserQuestion:

**Question 1**: Project name (if not provided as argument)
**Question 2**: Template selection (from discovered templates)
**Question 3**: Features (multi-select, based on template.features)
**Question 4**: Description (optional)

### Step 2.5: Pause (unless --yes)

```
Project Details
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:        {name}
Slug:        {slug}
Template:    {template}
Features:    {features}
Description: {description}

Continue? (y)es, (e)dit, (a)bort:
```

### Step 3: Validate Slug

1. Generate from name: lowercase, replace non-alphanumeric with hyphens
2. Check uniqueness: `Glob projects/*/project.json`
3. If conflict, show validation error and prompt for alternative

**Note**: Does not auto-append numbers. User must choose a unique slug.

### Step 4: Create Project Files

Create directory structure:
```
projects/{slug}/
├── project.json      # Project manifest
├── index.html        # Rendered from template
├── data.json         # (gantt template only) Starter tasks
└── reference/        # Documents directory
```

**project.json**:
```json
{
  "name": "{name}",
  "slug": "{slug}",
  "description": "{description}",
  "template": "{template}",
  "created": "YYYY-MM-DD",
  "features": { ... },
  "customPage": false
}
```

**index.html**: Render from `projects/_templates/{template}/index.html.ejs` pattern, substituting project values.

**data.json** (gantt only): Create starter file with empty tasks array.

### Step 5: Success Output

```
✓ Project Created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:        {name}
Slug:        {slug}
Template:    {template}
Features:    {features}
Location:    projects/{slug}/

Next steps:
  npm run dev
  Visit: http://localhost:5173/projects/{slug}/
```

---

## Templates

Templates are defined in `projects/_templates/`. Each has:
- `template.json` - Name, description, configurable features
- `index.html.ejs` - EJS template for page generation

| Template | Features | Description |
|----------|----------|-------------|
| `base` | documents | Minimal with navbar + document browser |
| `gantt` | gantt, documents | Timeline/Gantt chart with task tracking |
| `gallery` | documents, gallery | Grid/list view of documents with previews |

See `projects/_templates/*/` for implementation details.

---

## Examples

### Full interactive workflow

```
/new-project

→ Loading Templates
  Found: base, gantt, gallery

→ Project Details
  ? Project name: Kitchen Renovation
  ? Template: gantt - Timeline/Gantt chart with task tracking
  ? Features: [✓] gantt, [✓] documents
  ? Description: 2026 kitchen remodel tracking

→ Validation
  Slug: kitchen-renovation
  ✓ No conflicts found

→ Creating Files
  ✓ projects/kitchen-renovation/
  ✓ project.json
  ✓ index.html
  ✓ data.json
  ✓ reference/

✓ Project Created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:        Kitchen Renovation
Slug:        kitchen-renovation
Template:    gantt
Features:    gantt, documents
Location:    projects/kitchen-renovation/

Next steps:
  npm run dev
  Visit: http://localhost:5173/projects/kitchen-renovation/
```

### With flags (automated)

```
/new-project --yes --template base "Quick Notes"

→ Using defaults: template=base, features=documents
→ Creating project...

✓ Project Created: projects/quick-notes/
```

### With name argument

```
/new-project Deck Addition

→ Project Details
  Name: Deck Addition (from argument)
  ? Template: ...
```

### Dry run (preview)

```
/new-project --dry-run "Test Project"

→ Dry Run Preview
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Would create:
  projects/test-project/
  projects/test-project/project.json
  projects/test-project/index.html
  projects/test-project/reference/

No files created (dry run mode)
```

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "No templates found" | Empty `_templates/` directory | Add template directories with template.json |
| "Project already exists" | Slug conflicts with existing project | Choose different name or edit slug |
| "Invalid slug format" | Contains invalid characters | Use only lowercase letters, numbers, hyphens |
| "Template not found" | Invalid --template flag value | Use: base, gantt, or gallery |

---

## Notes

- **Auto-discovery**: Vite finds projects via `projects/*/project.json` - no config needed
- **Terminal fallback**: `npm run create-project` still works for terminal users
- **Extensibility**: Add new templates to `_templates/` with template.json + index.html.ejs
- **Validation**: Slugs must be unique and match pattern `^[a-z0-9-]+$`
- **Schema**: project.json should conform to `projects/_schema/project-data.schema.json`
- **Permissions**: Requires write access to `projects/` directory
