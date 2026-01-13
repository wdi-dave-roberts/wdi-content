#!/usr/bin/env bash
# Environment Validation Script
# Validates environment against env-baseline.json and auto-remediates when possible
#
# Exit codes:
#   0 = Environment valid (no issues)
#   1 = Environment valid after auto-remediation
#   2 = Environment blocked (issues require manual action)
#
# Usage:
#   ./validate-env.sh [--quiet] [--no-remediate]
#
# Output: Human-readable status.

set -euo pipefail

# Script location and baseline file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
BASELINE_FILE="${PLUGIN_ROOT}/env-baseline.json"

# Options
QUIET=false
NO_REMEDIATE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --quiet) QUIET=true; shift ;;
    --no-remediate) NO_REMEDIATE=true; shift ;;
    *) shift ;;
  esac
done

# Check for jq (needed to parse baseline)
if ! command -v jq &> /dev/null; then
  if [[ "$NO_REMEDIATE" == "false" ]]; then
    echo "Installing jq (required for validation)..."
    if [[ "$(uname)" == "Darwin" ]]; then
      brew install jq 2>/dev/null || true
    else
      sudo apt-get install -y jq 2>/dev/null || sudo dnf install -y jq 2>/dev/null || true
    fi
  fi

  if ! command -v jq &> /dev/null; then
    echo "ERROR: jq is required but not installed"
    exit 2
  fi
fi

# Check baseline exists
if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "ERROR: Baseline file not found: $BASELINE_FILE"
  exit 2
fi

# Track validation state
ISSUES_FOUND=()
ISSUES_FIXED=()
ISSUES_BLOCKED=()

# Detect OS for install hints
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "darwin" ;;
    Linux*) echo "linux" ;;
    *) echo "manual" ;;
  esac
}

OS=$(detect_os)

# Log helper
log() {
  if [[ "$QUIET" == "false" ]]; then
    echo "$@"
  fi
}

# Validate CLI tools
validate_cli_tools() {
  local tools
  tools=$(jq -c '.required_cli_tools[]' "$BASELINE_FILE" 2>/dev/null || echo "")

  while IFS= read -r tool; do
    [[ -z "$tool" ]] && continue

    local name check_cmd auth_check requires_auth can_auto_install install_hint auth_hint
    name=$(echo "$tool" | jq -r '.name')
    check_cmd=$(echo "$tool" | jq -r '.check_command')
    auth_check=$(echo "$tool" | jq -r '.auth_check // empty')
    requires_auth=$(echo "$tool" | jq -r '.requires_auth // false')
    can_auto_install=$(echo "$tool" | jq -r '.can_auto_install // false')
    install_hint=$(echo "$tool" | jq -r ".install_hints.${OS} // .install_hints.manual // empty")
    auth_hint=$(echo "$tool" | jq -r '.auth_hint // empty')

    # Check if tool exists
    if ! eval "$check_cmd" &> /dev/null; then
      ISSUES_FOUND+=("$name not installed")

      # Attempt auto-install
      if [[ "$NO_REMEDIATE" == "false" && "$can_auto_install" == "true" && -n "$install_hint" ]]; then
        log "  Installing $name..."
        if eval "$install_hint" &> /dev/null; then
          ISSUES_FIXED+=("Installed $name")
        else
          ISSUES_BLOCKED+=("$name not installed. Run: $install_hint")
        fi
      else
        ISSUES_BLOCKED+=("$name not installed. Run: $install_hint")
      fi
      continue
    fi

    # Check auth if required
    if [[ "$requires_auth" == "true" && -n "$auth_check" ]]; then
      if ! eval "$auth_check" &> /dev/null; then
        ISSUES_FOUND+=("$name not authenticated")
        ISSUES_BLOCKED+=("$name not authenticated. Run: $auth_hint")
      fi
    fi
  done <<< "$tools"
}

# Check if plugin is installed by looking at settings.json
is_plugin_installed() {
  local plugin_name="$1"
  local project_settings="${CLAUDE_PROJECT_DIR:-.}/.claude/settings.json"
  local user_settings="$HOME/.claude/settings.json"

  # Check project settings first
  if [[ -f "$project_settings" ]]; then
    if jq -e ".enabledPlugins | keys[] | select(startswith(\"$plugin_name@\"))" "$project_settings" &>/dev/null; then
      return 0
    fi
  fi

  # Check user settings
  if [[ -f "$user_settings" ]]; then
    if jq -e ".enabledPlugins | keys[] | select(startswith(\"$plugin_name@\"))" "$user_settings" &>/dev/null; then
      return 0
    fi
  fi

  return 1
}

# Validate plugins
validate_plugins() {
  local plugins
  plugins=$(jq -c '.required_plugins[]' "$BASELINE_FILE" 2>/dev/null || echo "")

  while IFS= read -r plugin; do
    [[ -z "$plugin" ]] && continue

    local name min_version
    name=$(echo "$plugin" | jq -r '.name')
    min_version=$(echo "$plugin" | jq -r '.min_version // empty')

    # Check if plugin is installed
    if ! is_plugin_installed "$name"; then
      ISSUES_FOUND+=("Plugin $name not installed")

      if [[ "$NO_REMEDIATE" == "false" ]]; then
        log "  Installing plugin: $name..."
        if claude plugin install "$name" --scope project &> /dev/null; then
          ISSUES_FIXED+=("Installed plugin $name")
        else
          ISSUES_BLOCKED+=("Plugin $name not installed. Run: claude plugin install $name --scope project")
        fi
      else
        ISSUES_BLOCKED+=("Plugin $name not installed. Run: claude plugin install $name --scope project")
      fi
    fi
  done <<< "$plugins"
}

# Get admin contact
get_admin_contact() {
  local name email note
  name=$(jq -r '.admin_contact.name // "Administrator"' "$BASELINE_FILE")
  email=$(jq -r '.admin_contact.email // ""' "$BASELINE_FILE")
  note=$(jq -r '.admin_contact.escalation_note // ""' "$BASELINE_FILE")

  echo ""
  echo "Admin contact: $name"
  [[ -n "$email" ]] && echo "Email: $email"
  [[ -n "$note" ]] && echo "Note: $note"
}

# Main validation
main() {
  log "Validating environment..."
  log ""

  # Run validations
  validate_cli_tools
  validate_plugins

  # Determine outcome
  local exit_code=0

  if [[ ${#ISSUES_BLOCKED[@]} -gt 0 ]]; then
    # Blocked - issues require manual action
    echo ""
    echo "Environment cannot be auto-fixed"
    echo ""
    echo "Issues requiring manual action:"
    for issue in "${ISSUES_BLOCKED[@]}"; do
      echo "  - $issue"
    done

    get_admin_contact
    echo ""
    echo "After fixing, say \"check my config\" to re-validate."
    exit_code=2

  elif [[ ${#ISSUES_FIXED[@]} -gt 0 ]]; then
    # Fixed - auto-remediation succeeded
    echo ""
    echo "Environment drift detected - fixed automatically"
    echo ""
    for fix in "${ISSUES_FIXED[@]}"; do
      echo "  $fix"
    done
    echo ""
    echo "Environment now validated"
    exit_code=1

  else
    # Valid - no issues
    if [[ "$QUIET" == "false" ]]; then
      echo "Environment validated"

      # Show what was checked
      local plugin_count tool_count
      plugin_count=$(jq '.required_plugins | length' "$BASELINE_FILE")
      tool_count=$(jq '.required_cli_tools | length' "$BASELINE_FILE")
      echo "  Plugins: $plugin_count checked"
      echo "  Tools: $tool_count checked"
    fi
    exit_code=0
  fi

  exit $exit_code
}

main
