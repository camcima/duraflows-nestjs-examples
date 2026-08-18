#!/usr/bin/env bash
set -euo pipefail

# v5.0.0: `workflow_definitions` has no REST endpoint (it's an internal
# integrity table, not part of the workflow instance API), so this script
# reads it directly via psql -- same connection/env handling as
# scripts/db/create-tables.sh and scripts/db/truncate-tables.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
DB_NAME="${DATABASE_NAME:-duraflows_examples}"
export PGPASSWORD="${DATABASE_PASSWORD:-postgres}"

# One row per (workflow_name, version) ever registered -- an immutable
# snapshot written by WorkflowRuntime.initialize() the first time that
# exact (name, version) pair is seen. `content_hash` excludes the `version`
# field itself, so it only changes when states/events/commands change.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT workflow_name,
         version,
         content_hash,
         registered_at
  FROM workflow_definitions
  ORDER BY workflow_name, version;
"
