# sync-config

Validate environment consistency and remediate drift.

## Triggers

This skill auto-invokes when you say:
- "check my config"
- "sync config"
- "validate environment"
- "check environment"
- "is my environment set up correctly"

## What It Does

1. Reads the `env-baseline.json` file defining required plugins and tools
2. Compares current environment against baseline
3. Auto-remediates fixable issues (missing plugins, outdated versions)
4. Reports unfixable issues with clear instructions
5. Shows admin contact if manual help is needed

## Workflow

### Step 1: Run Validation Script

```bash
${CLAUDE_PROJECT_DIR}/scripts/validate-env.sh
```

Or if running from plugin directory:

```bash
./scripts/validate-env.sh
```

### Step 2: Interpret Results

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | Environment valid | Report success |
| 1 | Auto-fixed | Report what was fixed |
| 2 | Blocked | Show issues and remediation steps |

### Step 3: Guide User (if blocked)

For issues requiring manual action, provide:
1. The specific issue
2. The exact command to fix it
3. Re-validation instructions

## Example Output

### Valid Environment
```
Environment validated
  Plugins: 1 checked
  Tools: 2 checked
```

### Auto-Fixed
```
Environment drift detected - fixed automatically

  Installed compound-engineering

Environment now validated
```

### Blocked
```
Environment cannot be auto-fixed

Issues requiring manual action:
  - gh not authenticated. Run: gh auth login

Admin contact: David Roberts
Email: david@whitedoeinn.com
Note: Include the full error output when contacting for help.

After fixing, say "check my config" to re-validate.
```

## Advanced Usage

### No Auto-Remediation
To check without fixing:
```bash
./scripts/validate-env.sh --no-remediate
```

### Quiet Mode
For scripting:
```bash
./scripts/validate-env.sh --quiet
```

## Notes

- Environment validation runs automatically on SessionStart via hooks
- This skill provides manual re-validation after fixing issues
- The baseline is defined in `env-baseline.json` at plugin root
- Auto-remediation requires appropriate permissions (brew/apt for tools, claude CLI for plugins)
