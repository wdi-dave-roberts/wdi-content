#!/usr/bin/env bash
# Environment Checker for wdi plugin
# Runs on SessionStart to validate environment against baseline
#
# This script delegates to validate-env.sh for comprehensive validation
# with auto-remediation support.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE_SCRIPT="${SCRIPT_DIR}/validate-env.sh"

# Run comprehensive environment validation
if [[ -x "$VALIDATE_SCRIPT" ]]; then
  "$VALIDATE_SCRIPT"
  EXIT_CODE=$?

  # Handle validation result
  case $EXIT_CODE in
    0)
      # Valid - nothing to report (output handled by validate-env.sh)
      ;;
    1)
      # Auto-fixed - output handled by validate-env.sh
      ;;
    2)
      # Blocked - output handled by validate-env.sh
      # For SessionStart hook, we show the message but don't block the shell
      # The user is informed and can choose to fix or continue at their own risk
      echo ""
      echo "WARNING: Your environment is out of sync. Workflows may not work correctly."
      echo ""
      ;;
  esac
else
  # Fallback: basic plugin check if validate-env.sh not available
  REQUIRED=("compound-engineering")
  MISSING=()

  for plugin in "${REQUIRED[@]}"; do
    if ! claude plugin list 2>/dev/null | grep -q "$plugin"; then
      MISSING+=("$plugin")
    fi
  done

  if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    echo "Missing required plugins: ${MISSING[*]}"
    echo "   Run: ./install.sh (from wdi plugin directory)"
    echo "   Or:  curl -sSL https://raw.githubusercontent.com/whitedoeinn/dev-plugins-workflows/main/install.sh | bash"
    echo ""
  fi
fi

# Check for deprecated wdi- repo prefix (light warning)
REPO_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)
if [[ "$REPO_NAME" == wdi-* ]]; then
  echo "Note: Repo '$REPO_NAME' uses deprecated wdi- prefix. See docs/standards/REPO-STANDARDS.md"
fi
