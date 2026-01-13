#!/bin/bash
# PreToolUse hook for git commit interception
# Part of the Standards Update Protocol and Commit Skill Enforcement
#
# This hook intercepts Bash commands and:
# 1. Reminds to use the commit skill (for changelog updates, tests, review)
# 2. Warns when standard files are staged
#
# Advisory only - warns but doesn't block.

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Extract the command being run
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only process git commit commands
if [[ ! "$COMMAND" =~ ^git[[:space:]]+commit ]] && [[ ! "$COMMAND" =~ \&\&[[:space:]]*git[[:space:]]+commit ]]; then
  exit 0
fi

# ============================================================
# Check 1: Enforce commit skill usage
# ============================================================
# Block direct git commit unless COMMIT_SKILL_ACTIVE is set.
# The commit skill sets this marker before running git commands.

if [ "$COMMIT_SKILL_ACTIVE" != "1" ]; then
  {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ❌ Direct git commit blocked"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Use the commit skill instead:"
    echo "    Say \"commit these changes\""
    echo ""
    echo "  The skill ensures:"
    echo "    • Changelog is updated"
    echo "    • Tests pass"
    echo "    • Code is reviewed for simplicity"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
  } >&2
  exit 1  # Block the commit
fi

# ============================================================
# Check 2: Standards file change detection
# ============================================================
STAGED_STANDARDS=$(git diff --cached --name-only 2>/dev/null | grep "^docs/standards/.*\.md$" || true)

if [ -n "$STAGED_STANDARDS" ]; then
  # Output additional warning to stderr
  {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Standards file change detected in commit"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Changed standards:"
    echo "$STAGED_STANDARDS" | while read -r file; do
      basename "$file" | sed 's/.md$//'
    done
    echo ""
    echo "Ensure you've updated all dependent files."
    echo "See: knowledge/standards-dependency-map.md"
    echo ""
    echo "To check impact: /wdi:update-standard --analyze"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
  } >&2
fi

# Exit 0 to allow the commit (advisory only, not blocking)
exit 0
