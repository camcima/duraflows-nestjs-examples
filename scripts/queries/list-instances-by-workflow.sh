#!/usr/bin/env bash
set -euo pipefail

# v5.0.0 side-by-side pattern (docs/side-by-side-versions.md). Lists workflow
# instances across ALL registered workflow names side by side, newest first,
# so `ecommerce-order` and `ecommerce-order-v2` rows can be compared directly
# -- proof the two names coexist, each carrying its own `definition_version`
# stamp. No REST endpoint returns instances across workflow names (the
# `/workflows/:uuid` endpoints are single-instance lookups), so this reads
# `workflow_instances` directly via psql -- same connection/env handling as
# scripts/db/create-tables.sh and scripts/queries/list-definition-snapshots.sh.
#
# Pass a workflow name to filter, e.g.:
#   ./scripts/queries/list-instances-by-workflow.sh ecommerce-order-v2

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

WORKFLOW_NAME_FILTER="${1:-}"

WHERE_CLAUSE=""
if [ -n "$WORKFLOW_NAME_FILTER" ]; then
  WHERE_CLAUSE="WHERE workflow_name = '$WORKFLOW_NAME_FILTER'"
fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT workflow_name,
         uuid,
         current_state,
         definition_version,
         created_at
  FROM workflow_instances
  $WHERE_CLAUSE
  ORDER BY workflow_name, created_at DESC
  LIMIT 50;
"
