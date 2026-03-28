#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

curl -s -X POST "$BASE_URL/workflows/timeouts/process" | jq .
