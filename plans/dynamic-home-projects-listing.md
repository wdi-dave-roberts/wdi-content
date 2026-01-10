# Feature Plan: Dynamic Home Page & Projects Listing

**Created:** 2026-01-09
**Status:** Planning

---

## Overview

Implement dynamic project discovery for the home page (/) and projects listing (/projects/) so they automatically show all projects without manual updates.

---

## Research Summary

### Current State
- **Home page (/)**: Static HTML with hardcoded project links
- **Projects listing (/projects/)**: Uses hardcoded `knownProjects` array
- **Auto-discovery**: Only works at build time for routing (vite.config.ts)

### Problem
When a new project is created, neither page updates automatically. The `knownProjects` array must be manually edited.

---

## Requirements

1. **Home page (/)** shows:
   - All projects in a responsive card grid
   - Static content links (expense forms)
   - Dynamic - updates when projects are added

2. **Projects listing (/projects/)** shows:
   - All projects in a responsive card grid
   - No manual updates needed
   - Empty state when no projects exist

3. **Auto-discovery**:
   - Generate manifest at build time
   - Both pages fetch manifest at runtime
   - Works in dev mode and production

---

## Acceptance Criteria

- [ ] Home page displays all projects dynamically
- [ ] Home page displays static content (expense forms)
- [ ] Projects listing displays all projects dynamically
- [ ] New projects appear automatically after `npm run build` or dev server restart
- [ ] Build passes with no errors
- [ ] Both pages work in dev mode (`npm run dev`)

---

## Implementation Plan

### Step 1: Add Vite Plugin to Generate Manifest

Modify `vite.config.ts` to:
1. Create a Vite plugin that generates `projects/_manifest.json`
2. Run during `buildStart` hook
3. Include: slug, name, description, template, created for each project
4. Also generate `public/_manifest.json` for static content

### Step 2: Update Projects Listing (/projects/index.html)

1. Remove hardcoded `knownProjects` array
2. Fetch `/projects/_manifest.json` in Alpine `init()`
3. Display all projects from manifest
4. Keep existing card styling and empty state

### Step 3: Update Home Page (/)

1. Add Alpine.js component for dynamic content
2. Fetch both manifests (projects + static)
3. Display projects section with cards
4. Display static content section (expense forms)
5. Keep hero section and styling

### Step 4: Test & Verify

1. Run `npm run build` - verify manifests generated
2. Run `npm run dev` - verify pages load correctly
3. Create test project - verify it appears after rebuild

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `vite.config.ts` | MODIFY | Add manifest generation plugin |
| `projects/index.html` | MODIFY | Fetch from manifest instead of hardcoded array |
| `index.html` | MODIFY | Add dynamic project/content listing |
| `projects/_manifest.json` | CREATE (generated) | Auto-generated project list |

---

## Technical Details

### Manifest Format (projects/_manifest.json)

```json
{
  "generated": "2026-01-09T12:00:00Z",
  "projects": [
    {
      "slug": "kitchen-remodel",
      "name": "Kitchen Remodel",
      "description": "2025 kitchen renovation project",
      "template": "gantt",
      "created": "2025-01-08"
    },
    {
      "slug": "deck-addition",
      "name": "Deck Addition",
      "description": "Outdoor deck project",
      "template": "gantt",
      "created": "2026-01-09"
    }
  ]
}
```

### Vite Plugin Structure

```typescript
function generateManifestPlugin(): Plugin {
  return {
    name: 'generate-manifest',
    buildStart() {
      // Scan projects/*/project.json
      // Write projects/_manifest.json
    },
    configureServer(server) {
      // Regenerate on file changes in dev mode
    }
  }
}
```

---

## Risks & Considerations

1. **Dev mode regeneration**: Manifest must regenerate when projects are added/removed
2. **Build order**: Manifest must be generated before pages are built
3. **Caching**: Browser may cache manifest - consider cache-busting or short cache headers

---

## Notes

- Keep existing styling patterns (DaisyUI cards, responsive grid)
- Follow Alpine.js patterns from existing pages
- Manifest is gitignored (generated artifact)
