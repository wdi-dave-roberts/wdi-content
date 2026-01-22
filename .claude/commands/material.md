# Material Management Command

Manage material dependencies for tasks in the kitchen remodel project. Supports adding, removing, and updating material status.

## CLI Commands

### List Materials

```bash
node scripts/task.js materials --task install-doors --action list
```

### Add Material

```bash
node scripts/task.js materials --task install-doors --action add --name "Weatherstripping" --mat-status need-to-order --quantity 3 --detail "3M foam tape" --vendor precision-flooring
```

**Flags:**
- `--task` (required) - Task ID
- `--action add` (required)
- `--name` (required) - Material name
- `--mat-status` (required) - Status: need-to-select, selected, need-to-order, ordered, on-hand
- `--quantity` (optional) - Quantity
- `--detail` (optional) - Specs/details
- `--vendor` (optional) - Vendor ID
- `--expected-date` (optional) - Expected delivery date YYYY-MM-DD
- `--order-link` (optional) - Order link URL

### Remove Material

```bash
node scripts/task.js materials --task install-doors --action remove --material weatherstripping
```

### Update Material Status

```bash
node scripts/task.js materials --task install-doors --action status --material weatherstripping --mat-status ordered
```

## Workflow

When the user asks to manage materials:

1. **Identify the task** - which task needs the material?

2. **Determine action** - list, add, remove, or update status?

3. **Gather information** for add:
   - Material name (required)
   - Status (required)
   - Quantity, detail, vendor, expected date, order link (optional)

4. **Construct CLI command** with gathered info

5. **Execute command** using Bash tool

6. **Report result** to user

7. **Loop back** - ask "Anything else?" or finish

## Exporting

Export is **not automatic**. When done with material changes:
- Say "done" to finish and optionally export via `/export-tracker`

## Valid Material Statuses

- `need-to-select` - Haven't decided what to buy yet
- `selected` - Decided but not ready to order
- `need-to-order` - Ready to order, need quantity/specs
- `ordered` - Order placed, awaiting delivery
- `on-hand` - Have it, ready to use

## Examples

### List materials for a task
User: "What materials are needed for install-doors?"

1. Run: `node scripts/task.js materials --task install-doors --action list`
2. Show results

### Add a new material
User: "Add weatherstripping to install-doors, need to order 3 rolls"

1. Run: `node scripts/task.js materials --task install-doors --action add --name "Weatherstripping" --mat-status need-to-order --quantity 3`
2. Asks: "Anything else?"

### Update material status
User: "The hinges for the back door have been ordered"

1. Find material ID (e.g., hinges-back-door)
2. Run: `node scripts/task.js materials --task install-doors --action status --material hinges-back-door --mat-status ordered`
3. Asks: "Anything else?"

### Add material with delivery info
User: "I ordered the door handles from Amazon, arriving Feb 20"

1. Run: `node scripts/task.js materials --task install-doors --action add --name "Door handles" --mat-status ordered --expected-date 2026-02-20 --order-link "https://amazon.com/..."`
2. Asks: "Anything else?"
