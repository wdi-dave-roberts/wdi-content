# Task Management Command

Interactive task management for the kitchen remodel project. Shows task details, then interactively handles any operation (status, dates, deps, materials, subtasks, etc.).

## Usage

- `/task <task-id>` - View and manage a specific task
- `/task` - List all tasks or create new task

## Interactive Flow

### When Given a Task ID

**User says:** `/task finish-drywall`

**Claude does:**

1. **Show task** using `npm run task show <id>`
2. **Display summary** including:
   - Status, dates, assignee
   - Dependencies and what depends on it
   - Materials (if any)
   - Subtasks (if any)
   - Related issues (if any)
3. **Ask:** "What would you like to do?" with options:
   - Update status
   - Update dates
   - Change assignee
   - Manage dependencies (add/remove)
   - Manage materials
   - Manage subtasks
   - View/resolve related issues
   - Nothing (just viewing)
4. **Handle selection** conversationally:
   - Gather needed info through follow-up questions
   - Execute appropriate CLI command
5. **Show updated task** to confirm
6. **Loop back** - ask "Anything else?" to continue or finish

### When Given No Task ID

**User says:** `/task`

**Claude does:**

1. **Ask:** "Would you like to list tasks or create a new task?"
2. **If list:** Run `npm run task list` and show summary
3. **If create:** Gather info conversationally (name, category, status, assignee, dates)

---

## CLI Reference

All operations are executed via CLI commands. Use these as reference for flag-based execution.

### Show Task

```bash
npm run task show <task-id>
```

Displays task details including status, dates, assignee, dependencies, materials, and subtasks.

### List Tasks

```bash
npm run task list
```

Lists all tasks with basic info.

### Create Task

```bash
npm run task add --name "Task name" --category finish --status needs-scheduled --assignee eliseo --start 2026-02-01 --end 2026-02-02
```

**Flags:**
- `--name` (required) - Task name
- `--category` (required) - See [Categories](#categories)
- `--status` (optional, default: needs-scheduled) - See [Statuses](#statuses)
- `--assignee` (optional) - Vendor ID
- `--start` (optional) - Start date YYYY-MM-DD
- `--end` (optional) - End date YYYY-MM-DD
- `--notes` (optional) - Notes
- `--force` (optional) - Skip duplicate check

### Create Subtask

```bash
npm run task add-subtask --parent install-doors --name "Install weatherstripping" --assignee eliseo
```

**Flags:**
- `--parent` (required) - Parent task ID
- `--name` (required) - Subtask name
- `--status` (optional) - Status (inherits from parent)
- `--assignee` (optional) - Vendor ID (inherits from parent)
- `--notes` (optional) - Notes

### Update Status

```bash
npm run task status --id install-doors --status in-progress
npm run task status --id install-doors --status cancelled --reason "Budget constraints"
```

**Flags:**
- `--id` (required) - Task ID
- `--status` (required) - New status
- `--reason` (optional) - Reason for status change (required for `cancelled` and `blocked` statuses)

When a reason is provided, a timestamped comment is appended to the task's Comments field:
```
1. 2026-01-21: Cancelled - Budget constraints
```

The command also:
- Warns about tasks that depend on cancelled/blocked tasks
- Notes tasks unblocked when a dependency completes
- Generates questions for the changed task based on lifecycle rules

### Update Dates

```bash
npm run task date --id install-doors --start 2026-02-15 --end 2026-02-16
```

**Flags:**
- `--id` (required) - Task ID
- `--start` (optional) - Start date YYYY-MM-DD
- `--end` (optional) - End date YYYY-MM-DD

### Assign Vendor

```bash
npm run task assign --id install-doors --assignee eliseo
```

**Flags:**
- `--id` (required) - Task ID
- `--assignee` (required) - Vendor ID

### Manage Dependencies

```bash
npm run task deps --id install-doors --add framing
npm run task deps --id install-doors --remove old-dependency
```

**Flags:**
- `--id` (required) - Task ID
- `--add` (optional) - Task ID to add as dependency
- `--remove` (optional) - Task ID to remove from dependencies

The command validates circular dependencies and shows impact warnings.

### Add Material to Task

```bash
npm run task materials --task install-doors --action add --name "Door hinges" --mat-status need-to-select
```

**Flags:**
- `--task` (required) - Parent task ID
- `--action add` (required) - Add action
- `--name` (required) - Material name
- `--mat-status` (optional, default: need-to-select) - See [Material Statuses](#material-statuses)
- `--quantity` (optional) - Quantity needed
- `--notes` (optional) - Notes

### Update Material Status

```bash
npm run task materials --task install-doors --action status --material door-hinges --mat-status ordered --reason "Ordered from Amazon"
```

**Flags:**
- `--task` (required) - Parent task ID
- `--action status` (required) - Status action
- `--material` (required) - Material ID
- `--mat-status` (required) - New material status
- `--reason` (optional) - Reason for status change

---

## Valid Values

### Statuses
pending, needs-scheduled, scheduled, confirmed, in-progress, completed, blocked, cancelled

### Categories
demolition, rough-in, structural, mechanical, electrical, plumbing, finish, fixtures, cleanup, inspection, trim, paint, framing, milestone, clean

### Material Statuses
need-to-select, selected, need-to-order, ordered, vendor-provided, on-hand

### Common Vendors
Run `npm run task list` or check data.json for current vendors. Common ones:
- danny, eliseo, brandon, dave, tonia
- chris-bland, craig-davenport, dion-cahoon
- crest, beach-gas, jerum, joclar-fields

---

## Exporting

Export is **not automatic** after each change. When the user says "done" or "finished":

1. Ask: "Would you like me to export the spreadsheet?"
2. If yes: Run `/export-tracker` for full pre-flight checks

For manual export without checks:
```bash
npm run task export
```

---

## Action Quick Reference

| Action | CLI Command | When to Offer |
|--------|-------------|---------------|
| Update status | `npm run task status --id X --status Y` | Always |
| Update dates | `npm run task date --id X --start Y --end Z` | Always |
| Change assignee | `npm run task assign --id X --assignee Y` | Always |
| Add dependency | `npm run task deps --id X --add Y` | Always |
| Remove dependency | `npm run task deps --id X --remove Y` | When has deps |
| Add material | `npm run task materials --task X --action add --name Y` | Always |
| Update material status | `npm run task materials --task X --action status --material Y --mat-status Z` | When has materials |
| Add subtask | `npm run task add-subtask --parent X --name Y` | Always |
| Update subtask | Same commands using subtask ID | When has subtasks |

---

## Examples

### Interactive task management

**User:** `/task install-doors`

**Claude:**
1. Runs `npm run task show install-doors`
2. Shows summary:
   ```
   Task: Install Doors
   Status: scheduled | Dates: Feb 15-16 | Assignee: Eliseo
   Dependencies: framing (completed), trim-rough-openings (in-progress)
   Materials: 3 items (2 ordered, 1 need-to-select)
   Subtasks: 2 items (1 completed, 1 pending)
   Issues: 1 open (SPECIFY: What size hinges?)
   ```
3. Asks: "What would you like to do?"
4. User says: "Add a dependency on drywall"
5. Runs: `npm run task deps --id install-doors --add drywall`
6. Shows updated task
7. Asks: "Anything else?"

### Create a new task

**User:** `/task`

**Claude:**
1. Asks: "Would you like to list tasks or create a new task?"
2. User says: "Create a task for installing the coach lamp"
3. Asks clarifying questions (category, dates, assignee)
4. Runs: `npm run task add --name "Install Coach Lamp" --category electrical --status needs-scheduled`
5. Shows created task
6. Asks: "Anything else?"

### Quick status update

**User:** `/task install-doors`

**Claude:** (shows task, asks what to do)

**User:** "Mark it in-progress"

**Claude:**
1. Runs: `npm run task status --id install-doors --status in-progress`
2. Shows updated task
3. Asks: "Anything else?"

### End of session

**User:** "That's all for now"

**Claude:**
1. Asks: "Would you like me to export the spreadsheet?"
2. If yes: Runs `/export-tracker`
