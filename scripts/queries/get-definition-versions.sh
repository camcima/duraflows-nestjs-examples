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
# The history endpoint returns newest-first (ORDER BY created_at DESC, uuid
# DESC as a tiebreak); reverse it here so single-hop transitions read
# top-to-bottom in the order they happened.
# v5.0.0: each row's `createdAt` is included below. Caveat -- `createdAt` is
# transaction-scoped (Postgres `now()`), so an event and its entire `onEnter`
# chain share one identical timestamp. When rows tie, the DESC-then-reversed
# order above falls back to the random uuid tiebreak, NOT execution order --
# do not read `createdAt` (or this reversed ordering) as reconstructing the
# order of steps within one multi-hop transition. See docs/definition-versions.md.
echo "History (oldest first; ties within one transaction are NOT ordered by createdAt):"
curl -s "$BASE_URL/workflows/$UUID/history" \
  | jq 'reverse | map({eventName, fromState, toState, outcome, definitionVersion, createdAt})'
