#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: get-events.sh <uuid>}"

curl -s "$BASE_URL/workflows/$UUID/events" | jq .
