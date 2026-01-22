# Export Tracker Command

Generate the kitchen remodel spreadsheet with pre-flight checks.

## Usage

- `/export-tracker` - Full workflow with checks
- `/export-tracker --skip-copy` - Export only, no Google Drive copy
- `/export-tracker --force` - Continue even if validation has warnings

## Flags

| Flag | Description |
|------|-------------|
| `--skip-copy` | Export but don't offer Google Drive copy |
| `--force` | Continue even if validation has warnings |

## Workflow

### Step 0: Import & Check Responses

Pull any new responses from the existing spreadsheet:

```bash
node scripts/import-responses.js
```

Then check for answered-but-unprocessed issues:

```bash
npm run task issues --status answered
```

If there are unprocessed responses, use AskUserQuestion with options:
- **Process now** - Run `/process-issues` workflow before continuing
- **Skip** - Continue with export (responses remain pending)
- **Abort** - Stop export so user can handle manually

### Step 1: Validate Data

Run validation and stop on errors:

```bash
npm run task validate
```

- If errors: **Stop** and show what needs fixing
- If warnings only: Show warnings and continue (unless user wants to fix)

### Step 2: Auto-Detect Issues

Run detection rules:

```bash
npm run task detect
```

Report:
- New issues created (schedule conflicts, past-due, etc.)
- Issues auto-resolved (conditions cleared)

### Step 3: Material Lifecycle Check

Ensure all materials have appropriate questions:

```bash
npm run task materials-check
```

Report any new questions generated.

### Step 4: Export Spreadsheet

Generate Excel + CSVs:

```bash
npm run task export
```

Show summary of what was generated:
- Number of sheets
- Total tasks, materials, vendors
- Open issues count

### Step 5: Copy to Google Drive

Unless `--skip-copy` flag was provided:

Use AskUserQuestion to ask if user wants to copy to Google Drive.

If yes:
```bash
cp projects/kitchen-remodel/Kitchen-Remodel-Tracker.xlsx ~/Google\ Drive/Shared\ drives/White\ Doe\ Inn/Operations/Building\ and\ Maintenance\ /Kitchen\ Remodel/
```

Confirm success.

## Example Run

**User:** `/export-tracker`

**Claude:**

```
Step 0: Importing responses...
✓ Imported 2 new responses

⚠️ 2 answered issues need processing
```

Ask: "Process now, skip, or abort?"
User says "skip"

```
Step 1: Validating data...
✓ Validation passed (2 warnings)
  - Warning: Task "install-doors" has no end date
  - Warning: Material "cabinet-hardware" missing quantity

Step 2: Running auto-detection...
✓ Detection complete
  - Found 1 new issue: schedule-conflict-install-doors
  - Resolved 2 issues (conditions cleared)

Step 3: Checking material lifecycle...
✓ Material check complete
  - Generated 0 new questions

Step 4: Exporting spreadsheet...
✓ Exported Kitchen-Remodel-Tracker.xlsx
  - 7 sheets
  - 45 tasks, 23 materials, 8 vendors
  - 12 open issues
```

Ask: "Copy to Google Drive?"
If yes:
```
✓ Copied to Google Drive
  ~/Google Drive/Shared drives/White Doe Inn/.../Kitchen-Remodel-Tracker.xlsx
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Validation errors | Schema violations in data.json | Fix the reported errors before exporting |
| Import fails | Google Drive not synced or spreadsheet missing | Check sync status, verify file exists |
| Export fails | Write permission or disk space | Check permissions on projects/kitchen-remodel/ |
| Copy fails | Google Drive path doesn't exist | Verify shared drive is mounted |

## Data Locations

- Source data: `projects/kitchen-remodel/data.json`
- Generated spreadsheet: `projects/kitchen-remodel/Kitchen-Remodel-Tracker.xlsx`
- Generated CSVs: `projects/kitchen-remodel/exports/*.csv`
- Google Drive destination: `~/Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/`

## Related Commands

| Command | Description |
|---------|-------------|
| `/process-issues` | Process answered issues one by one |
| `npm run task validate` | Run validation only |
| `npm run task detect` | Run auto-detection only |
| `npm run task export` | Run export only (no pre-flight) |
| `npm run task issues` | List current issues |

## Notes

- All logic stays in CLI - this command just orchestrates
- Each step shows clear output before proceeding
- Errors stop the workflow early
- Warnings allow continuation with user awareness
- No changes to task.js or export script - pure orchestration
