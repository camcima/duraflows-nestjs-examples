#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: add-note.sh <uuid> [note-text]}"
NOTE="${2:-Customer called to confirm shipping address}"

# v1.0.0: command-only event — `note_added` defines no `targetState`, so the
# command runs as a side effect and the workflow stays in `pending`.
curl -s -X POST "$BASE_URL/workflows/$UUID/events/note_added" \
  -H "Content-Type: application/json" \
  -d "{
    \"triggerMetadata\": { \"actor\": \"support@company.com\", \"source\": \"crm\" },
    \"subject\": { \"note\": \"$NOTE\" }
  }" | jq .
