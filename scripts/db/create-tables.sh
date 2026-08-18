#!/usr/bin/env bash
set -euo pipefail

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

# Create the database if it doesn't exist
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null \
  && echo "Database \"$DB_NAME\" created" \
  || echo "Database \"$DB_NAME\" already exists"

# Create tables and indexes (idempotent). Mirrors the schema produced by
# `generateMigrationSql()` in @duraflows/pg (dbmate migrations 001-004).
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL'
CREATE TABLE IF NOT EXISTS workflow_instances (
  uuid                uuid PRIMARY KEY,
  workflow_name       text NOT NULL,
  current_state       text NOT NULL,
  version             integer NOT NULL DEFAULT 0,
  definition_version  integer NULL,
  expires_at          timestamptz NULL,
  last_transition_at  timestamptz NOT NULL DEFAULT now(),
  context_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS definition_version integer NULL;

CREATE INDEX IF NOT EXISTS workflow_instances_workflow_name_idx
  ON workflow_instances (workflow_name);

CREATE INDEX IF NOT EXISTS workflow_instances_expires_at_idx
  ON workflow_instances (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_history (
  uuid                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_uuid  uuid NOT NULL
    REFERENCES workflow_instances(uuid),
  from_state              text,
  event_name              text NOT NULL,
  to_state                text NOT NULL,
  outcome                 text NOT NULL CHECK (outcome IN ('success', 'failure', 'guard-rejected')),
  error_message           text,
  rejected_by             text,
  command_results_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  trigger_metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  definition_version      integer NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Widen the outcome check + add the guard/version columns for tables that
-- already existed from a pre-5.0.0 install (CREATE TABLE IF NOT EXISTS is a
-- no-op on those, so the ALTERs below are what actually bring them current).
ALTER TABLE workflow_history DROP CONSTRAINT IF EXISTS workflow_history_outcome_check;
ALTER TABLE workflow_history ADD CONSTRAINT workflow_history_outcome_check
  CHECK (outcome IN ('success', 'failure', 'guard-rejected'));
ALTER TABLE workflow_history ADD COLUMN IF NOT EXISTS rejected_by text;
ALTER TABLE workflow_history ADD COLUMN IF NOT EXISTS definition_version integer NULL;

CREATE INDEX IF NOT EXISTS workflow_history_instance_created_idx
  ON workflow_history (workflow_instance_uuid, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  workflow_name    text NOT NULL,
  version          integer NOT NULL,
  content_hash     text NOT NULL,
  definition_json  jsonb NOT NULL,
  registered_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_name, version)
);
SQL

echo "Tables created successfully"
