CREATE TABLE IF NOT EXISTS access_grants (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  environment TEXT NOT NULL,
  role TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_code_env ON projects (environment, code);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  identifier TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_env ON vendors (environment, name_key);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  drawing TEXT NOT NULL DEFAULT '',
  vendor_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS parts_code_env ON parts (environment, code);

CREATE TABLE IF NOT EXISTS source_lookups (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS source_lookups_subject ON source_lookups (environment, subject_key, observed_at);
