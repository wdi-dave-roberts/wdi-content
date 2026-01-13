---
description: Set up wdi plugin and its dependencies
---

# Setup Claude Workflows

This command helps set up the wdi plugin and its dependencies.

## Steps

1. **Check Dependencies**
   - Verify `compound-engineering` plugin is installed
   - If missing, provide installation instructions

2. **Verify Installation**
   - Check that `/wdi:feature` command is available
   - Check that `commit` skill is available (say "commit these changes" to trigger)
   - List available commands from this plugin

3. **Initialize Project**
   - Check for CLAUDE.md in the project
   - If missing, offer to create a starter template

## Installation Commands

If dependencies are missing, run:

```bash
# Add compound-engineering marketplace
/plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin

# Install compound-engineering
/plugin install compound-engineering

# Add wdi marketplace
/plugin marketplace add https://github.com/whitedoeinn/dev-plugins-workflows

# Install wdi
/plugin install wdi
```

Or use the bootstrap script:

```bash
curl -sSL https://raw.githubusercontent.com/whitedoeinn/dev-plugins-workflows/main/install.sh | bash
```

## Updating Plugins

To update to the latest versions:

```bash
./install.sh update
```

Or manually:

```bash
claude plugin update compound-engineering --scope project
claude plugin update wdi --scope project
```
