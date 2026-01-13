---
description: Create a new command and update all dependent files
---

# /wdi:new-command - Create Command

Add a new command to the wdi plugin and automatically update all dependent files (install.sh, README.md, CLAUDE.md).

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmations after interview |

---

## Workflow Overview

```
Interview → Generate → Update Dependents → Verify → Commit
```

This command solves the problem of needing to update multiple files when adding a new command:
- `commands/{name}.md` - The command itself
- `install.sh` - CLAUDE.md template, output, --show-commands
- `README.md` - Command table
- `CLAUDE.md` - Project command list
- `knowledge/standards-dependency-map.md` - CLAUDE-CODE-STANDARDS impact score

---

## Phase 1: Interview

Use `AskUserQuestion` to gather command details.

### Question 1: Command Type

```
What type of command is this?
```

| Option | Description |
|--------|-------------|
| **Workflow** | Multi-phase process (like feature, commit) |
| **Standards** | Enforces or works with standards (like check-standards, new-repo) |
| **Utility** | Helper or setup command (like setup) |

### Question 2: Command Name

```
What should the command be named?
```

**Naming rules:**
- Use lowercase with hyphens: `new-command`, `check-standards`
- Be descriptive but concise
- Follow existing patterns

**Propose name based on type:**
- Workflow: verb-noun (e.g., `run-tests`, `deploy-app`)
- Standards: action-target (e.g., `validate-structure`, `fix-naming`)
- Utility: function (e.g., `setup`, `clean`)

### Question 3: Short Description

```
Provide a short description (one line, for tables):
```

Example: "Create a new command and update all dependent files"

### Question 4: Complexity

```
How complex is this command?
```

| Option | Description |
|--------|-------------|
| **Simple** | Single-step, no interview needed |
| **Moderate** | Few steps, may have flags |
| **Complex** | Multi-phase with interview workflow |

---

## Phase 2: Generate Command File

### Use Template

Read template based on complexity:

**Simple template:**
```markdown
---
description: {short-description}
---

# /wdi:{name} - {Title}

{Description of what the command does.}

## Steps

1. **Step One**
   - Action
   - Action

2. **Step Two**
   - Action

## Notes

- Note about usage
```

**Moderate template:**
```markdown
---
description: {short-description}
---

# /wdi:{name} - {Title}

{Description of what the command does.}

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmations |

## Workflow

### Step 1: {First Step}

{Description}

```bash
# Example command
```

### Step 2: {Second Step}

{Description}

## Examples

### Basic usage

```
/wdi:{name}
```

## Notes

- Note about usage
```

**Complex template:**
```markdown
---
description: {short-description}
---

# /wdi:{name} - {Title}

{Description of what the command does.}

## Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmations |

---

## Workflow Overview

```
Phase 1 → Phase 2 → Phase 3
```

---

## Phase 1: Interview

Use `AskUserQuestion` to gather context.

### Question 1: {First Question}

```
{Question text}
```

| Option | Description |
|--------|-------------|
| **Option 1** | Description |
| **Option 2** | Description |

---

## Phase 2: {Action Phase}

### Step 1: {First Step}

{Description}

### Step 2: {Second Step}

{Description}

---

## Phase 3: {Completion Phase}

### Verify

{Verification steps}

### Output

```
{Example output}
```

---

## Examples

### Example 1: {Use case}

```
/wdi:{name}

? {Question 1}
  → {Answer}

→ {Action taken}
→ {Result}

✓ Complete
```

---

## Notes

- Note about usage
```

### Create File

```bash
# Write the command file
Write to: commands/{name}.md
```

---

## Phase 3: Update Dependent Files

### 3.1: Update install.sh

**Three sections need updating:**

#### Section 1: --show-commands output

Find and update:
```bash
# Handle show-commands flag
if [ "$1" = "--show-commands" ]; then
```

Add new command to appropriate category (Workflow or Standards).

#### Section 2: CLAUDE.md template

Find and update the heredoc:
```bash
cat > CLAUDE.md << 'EOF'
```

Add new command to appropriate category.

#### Section 3: Final output

Find and update:
```bash
echo "Available commands:"
```

Add new command line.

### 3.2: Update README.md

Find the command table for the appropriate type:

**For Workflow commands:**
```markdown
### Workflow Commands

| Command | Description |
|---------|-------------|
```

**For Standards commands:**
```markdown
### Standards Commands

| Command | Description |
|---------|-------------|
```

Add row:
```markdown
| `/wdi:{name}` | {short-description} |
```

### 3.3: Update CLAUDE.md

Find the appropriate section and add the command:

```markdown
### {Type} Commands
- `/wdi:{name}` - {short-description}
```

### 3.4: Update Dependency Map

Update `knowledge/standards-dependency-map.md`:

1. Under CLAUDE-CODE-STANDARDS.md, increment impact score
2. The new command file enforces CLAUDE-CODE-STANDARDS (naming convention)

---

## Phase 4: Verify

### Run Validation

```bash
./scripts/validate-dependency-map.sh
```

### Check Files Updated

```bash
git status --short
```

Expected changes:
- `commands/{name}.md` (new)
- `install.sh` (modified)
- `README.md` (modified)
- `CLAUDE.md` (modified)
- `knowledge/standards-dependency-map.md` (modified)

### Preview Changes

```bash
git diff --stat
```

---

## Phase 5: Commit

### Stage All Changes

```bash
git add -A
```

### Commit

```bash
git commit -m "feat: Add /wdi:{name} command

{Short description}

Updated:
- commands/{name}.md (new)
- install.sh
- README.md
- CLAUDE.md
- knowledge/standards-dependency-map.md

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Example

### Creating a new workflow command

```
/wdi:new-command

? What type of command is this?
  → Workflow

? What should the command be named?
  → run-tests

? Provide a short description:
  → Run tests for changed files with coverage

? How complex is this command?
  → Moderate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creating: /wdi:run-tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

→ Creating commands/run-tests.md...
→ Updating install.sh...
  - Added to --show-commands
  - Added to CLAUDE.md template
  - Added to output
→ Updating README.md...
  - Added to Workflow Commands table
→ Updating CLAUDE.md...
  - Added to Workflow Commands section
→ Updating dependency map...
  - CLAUDE-CODE-STANDARDS impact: 6 → 7

Validation: ✓ passed

Files changed:
  A commands/run-tests.md
  M install.sh
  M README.md
  M CLAUDE.md
  M knowledge/standards-dependency-map.md

Commit? (y)es, (r)eview, (a)bort: y

✓ Committed: feat: Add /wdi:run-tests command
```

---

## Notes

- Commands use domain-prefixed naming: `workflows-*`, `standards-*` (per PLUGIN-ARCHITECTURE.md)
- Command names should be lowercase with hyphens
- Short descriptions should be under 80 characters
- Complex commands should follow the interview-driven pattern
- Run validation after to ensure dependency map is accurate
