# /new-project

Create a new project using the interactive CLI.

## Usage

When the user runs `/new-project`, execute the project creation script:

```bash
npm run create-project
```

This will launch an interactive prompt that guides through:
1. Project name
2. URL slug
3. Description (optional)
4. Template selection (base, gantt, gallery)
5. Feature toggles

The script creates:
- `projects/{slug}/project.json` - Project configuration
- `projects/{slug}/index.html` - Page from template
- `projects/{slug}/reference/` - Directory for documents

After creation, the project is automatically discovered by Vite and accessible at `/projects/{slug}/`.
