#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: get-definition-versions.sh <uuid>}"

# v5.0.0: pulls the instance's own `definitionVersion` stamp and lines it up
# against the `definitionVersion` recorded on each of its history rows.
# `null` means the row predates versioning (a legacy row that will adopt the
# current version on its next transition). Reminder: this is provenance only
# -- every instance still executes the *currently registered* definition
# regardless of what it's stamped with. See docs/definition-versions.md.

echo "Instance:"
curl -s "$BASE_URL/workflows/$UUID" | jq '{uuid, workflowName, currentState, definitionVersion}'

echo
# The history endpoint returns newest-first (ORDER BY created_at DESC); reverse
# it here so the transitions read top-to-bottom in the order they happened.
# Note: the API does not expose a timestamp or uuid per history row, only the
# fields below.
echo "History (oldest first):"
curl -s "$BASE_URL/workflows/$UUID/history" \
  | jq 'reverse | map({eventName, fromState, toState, outcome, definitionVersion})'
