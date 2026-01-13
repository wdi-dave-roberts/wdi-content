#!/bin/bash
#
# update-plugins.sh - Update vendored wdi plugin from source
#
# Usage: ./scripts/update-plugins.sh
#
# This script re-vendors the wdi plugin from its source location.
# Modify WDI_SOURCE if your dev-plugins repo is elsewhere.
#

set -e

# Configure source location (modify if needed)
WDI_SOURCE="${WDI_SOURCE:-$HOME/vscode-projects/dev-plugins-workflows}"

if [ ! -d "$WDI_SOURCE" ]; then
    echo "Error: wdi source not found at $WDI_SOURCE"
    echo "Set WDI_SOURCE environment variable to the correct path"
    exit 1
fi

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Updating wdi plugin from: $WDI_SOURCE"
echo "Target project: $PROJECT_ROOT"

# Run the vendor script from source
"$WDI_SOURCE/scripts/vendor-to-project.sh" "$PROJECT_ROOT"

echo ""
echo "Plugin updated successfully!"
echo ""
echo "Remember: compound-engineering is a global dependency."
echo "To update it: claude plugin update compound-engineering --scope project"
