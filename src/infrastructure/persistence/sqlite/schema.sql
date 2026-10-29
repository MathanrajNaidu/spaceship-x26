PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS passengers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passengers_tier_status ON passengers (tier, status);
CREATE INDEX IF NOT EXISTS idx_passengers_created_at ON passengers (created_at, id);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  minimum_tier TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL,
  provisioned_at TEXT NOT NULL,
  decommissioned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_resources_status_type_tier ON resources (status, type, minimum_tier);
CREATE INDEX IF NOT EXISTS idx_resources_provisioned_at ON resources (provisioned_at, id);

CREATE TABLE IF NOT EXISTS usage_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  passenger_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  tier_at_start TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON usage_sessions (started_at, id);
CREATE INDEX IF NOT EXISTS idx_sessions_passenger_resource ON usage_sessions (passenger_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active_resource
  ON usage_sessions (resource_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_entries (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  passenger_id TEXT,
  resource_id TEXT,
  session_id TEXT,
  reason TEXT,
  metadata TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_entries (occurred_at, id);
CREATE INDEX IF NOT EXISTS idx_audit_passenger ON audit_entries (passenger_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_entries (resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_outcome ON audit_entries (action, outcome);
