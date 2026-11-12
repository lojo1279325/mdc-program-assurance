import { randomBytes } from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { ENVIRONMENTS, ROLES, normalizeEmail } from "./policy.js";

const SCHEMA = `
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
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL,
  PRIMARY KEY (code, environment)
);
CREATE TABLE IF NOT EXISTS record_versions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  environment TEXT NOT NULL,
  version INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  saved_by TEXT NOT NULL,
  change_note TEXT NOT NULL DEFAULT '',
  batch_id TEXT,
  snapshot TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS record_versions_key ON record_versions (code, environment, version);
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  label TEXT NOT NULL,
  applied INTEGER NOT NULL,
  unchanged INTEGER NOT NULL,
  rejected INTEGER NOT NULL
);`;

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return randomBytes(24).toString("base64url");
}

function mapGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    environment: row.environment,
    role: row.role,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  };
}

function createMemory() {
  const grants = [];
  const sessions = [];
  const items = [];
  return {
    kind: "memory",
    async activeGrant(email, environment) {
      return grants.find((row) => row.email === email && row.environment === environment && !row.revoked_at) || null;
    },
    async listGrants(environment) {
      return grants.filter((row) => row.environment === environment).map(mapGrant);
    },
    async grant(input) {
      for (const row of grants) {
        if (row.email === input.email && row.environment === input.environment && !row.revoked_at) {
          row.revoked_at = nowIso();
          row.revoked_by = input.grantedBy;
        }
      }
      const row = {
        id: newId(),
        email: input.email,
        environment: input.environment,
        role: input.role,
        granted_by: input.grantedBy,
        granted_at: nowIso(),
        revoked_at: null,
        revoked_by: null,
      };
      grants.unshift(row);
      return mapGrant(row);
    },
    async createSession(email, provider) {
      const row = {
        id: newId(),
        email,
        provider,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      };
      sessions.push(row);
      return row;
    },
    async readSession(id) {
      const row = sessions.find((item) => item.id === id);
      if (!row || row.expires_at <= nowIso()) return null;
      return row;
    },
    async deleteSession(id) {
      const index = sessions.findIndex((item) => item.id === id);
      if (index >= 0) sessions.splice(index, 1);
    },
    async listItems(environment) {
      return items.filter((item) => item.environment === environment);
    },
    async saveItem(input) {
      const existing = items.find((item) => item.code === input.code && item.environment === input.environment);
      if (existing) {
        existing.status = input.status;
        existing.note = input.note;
        return existing;
      }
      const row = { ...input };
      items.push(row);
      return row;
    },
    ...versionMemory(),
  };
}

function createFileStore() {
  const path = process.env.SQLITE_PATH || "data.db.json";
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(path, "utf8"));
    } catch {
      return { grants: [], sessions: [], items: [] };
    }
  };
  const write = (data) => fs.writeFileSync(path, JSON.stringify(data));
  return {
    kind: "file",
    async activeGrant(email, environment) {
      return read().grants.find((row) => row.email === email && row.environment === environment && !row.revoked_at) || null;
    },
    async listGrants(environment) {
      return read().grants.filter((row) => row.environment === environment).map(mapGrant);
    },
    async grant(input) {
      const data = read();
      for (const row of data.grants) {
        if (row.email === input.email && row.environment === input.environment && !row.revoked_at) {
          row.revoked_at = nowIso();
          row.revoked_by = input.grantedBy;
        }
      }
      const row = {
        id: newId(),
        email: input.email,
        environment: input.environment,
        role: input.role,
        granted_by: input.grantedBy,
        granted_at: nowIso(),
        revoked_at: null,
        revoked_by: null,
      };
      data.grants.unshift(row);
      write(data);
      return mapGrant(row);
    },
    async createSession(email, provider) {
      const data = read();
      const row = {
        id: newId(),
        email,
        provider,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      };
      data.sessions.push(row);
      write(data);
      return row;
    },
    async readSession(id) {
      const row = read().sessions.find((item) => item.id === id);
      if (!row || row.expires_at <= nowIso()) return null;
      return row;
    },
    async deleteSession(id) {
      const data = read();
      data.sessions = data.sessions.filter((item) => item.id !== id);
      write(data);
    },
    async listItems(environment) {
      return read().items.filter((item) => item.environment === environment);
    },
    async saveItem(input) {
      const data = read();
      const index = data.items.findIndex((item) => item.code === input.code && item.environment === input.environment);
      if (index >= 0) data.items[index] = input;
      else data.items.push(input);
      write(data);
      return input;
    },
    ...versionFile(read, write),
  };
}

function createPostgres(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: true },
    max: 2,
  });
  let ready = null;
  const ensure = () => {
    ready ||= pool.query(SCHEMA);
    return ready;
  };
  return {
    kind: "postgres",
    async activeGrant(email, environment) {
      await ensure();
      const result = await pool.query("SELECT * FROM access_grants WHERE email = $1 AND environment = $2 AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 1", [email, environment]);
      return result.rows[0] || null;
    },
    async listGrants(environment) {
      await ensure();
      const result = await pool.query("SELECT * FROM access_grants WHERE environment = $1 ORDER BY granted_at DESC", [environment]);
      return result.rows.map(mapGrant);
    },
    async grant(input) {
      await ensure();
      await pool.query("UPDATE access_grants SET revoked_at = $1, revoked_by = $2 WHERE email = $3 AND environment = $4 AND revoked_at IS NULL", [nowIso(), input.grantedBy, input.email, input.environment]);
      const row = {
        id: newId(),
        email: input.email,
        environment: input.environment,
        role: input.role,
        granted_by: input.grantedBy,
        granted_at: nowIso(),
      };
      await pool.query("INSERT INTO access_grants (id, email, environment, role, granted_by, granted_at) VALUES ($1, $2, $3, $4, $5, $6)", [row.id, row.email, row.environment, row.role, row.granted_by, row.granted_at]);
      return mapGrant({ ...row, revoked_at: null, revoked_by: null });
    },
    async createSession(email, provider) {
      await ensure();
      const row = {
        id: newId(),
        email,
        provider,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      };
      await pool.query("INSERT INTO sessions (id, email, provider, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)", [row.id, row.email, row.provider, row.created_at, row.expires_at]);
      return row;
    },
    async readSession(id) {
      await ensure();
      const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
      const row = result.rows[0];
      if (!row || row.expires_at <= nowIso()) return null;
      return row;
    },
    async deleteSession(id) {
      await ensure();
      await pool.query("DELETE FROM sessions WHERE id = $1", [id]);
    },
    async listItems(environment) {
      await ensure();
      const result = await pool.query("SELECT code, kind, status, note, environment FROM items WHERE environment = $1 ORDER BY code", [environment]);
      return result.rows;
    },
    async saveItem(input) {
      await ensure();
      await pool.query(`INSERT INTO items (code, kind, status, note, environment) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code, environment) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, kind = EXCLUDED.kind`, [input.code, input.kind, input.status, input.note, input.environment]);
      return input;
    },
    ...versionPostgres(pool, ensure),
  };
}

function versionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    environment: row.environment,
    version: row.version,
    savedAt: row.saved_at,
    savedBy: row.saved_by,
    changeNote: row.change_note,
    batchId: row.batch_id,
    snapshot: row.snapshot,
  };
}

function versionMemory() {
  const versions = [];
  const batches = [];
  return {
    async latestVersion(code, environment) {
      return versions.filter((row) => row.code === code && row.environment === environment).reduce((max, row) => Math.max(max, row.version), 0);
    },
    async listVersions(code, environment) {
      return versions.filter((row) => row.code === code && row.environment === environment).sort((a, b) => b.version - a.version).slice(0, 20).map(versionRow);
    },
    async readVersion(code, environment, version) {
      return versionRow(versions.find((row) => row.code === code && row.environment === environment && row.version === version) || null);
    },
    async appendVersion(input) {
      const row = {
        id: newId(),
        code: input.code,
        environment: input.environment,
        version: input.version,
        saved_at: nowIso(),
        saved_by: input.savedBy,
        change_note: input.changeNote || "",
        batch_id: input.batchId || null,
        snapshot: input.snapshot,
      };
      versions.push(row);
      return versionRow(row);
    },
    async saveBatch(input) {
      const row = { id: newId(), ...input, created_at: nowIso() };
      batches.unshift(row);
      return row;
    },
  };
}

function versionFile(read, write) {
  return {
    async latestVersion(code, environment) {
      return (read().versions || []).filter((row) => row.code === code && row.environment === environment).reduce((max, row) => Math.max(max, row.version), 0);
    },
    async listVersions(code, environment) {
      return (read().versions || []).filter((row) => row.code === code && row.environment === environment).sort((a, b) => b.version - a.version).slice(0, 20).map(versionRow);
    },
    async readVersion(code, environment, version) {
      return versionRow((read().versions || []).find((row) => row.code === code && row.environment === environment && row.version === version) || null);
    },
    async appendVersion(input) {
      const data = read();
      data.versions ||= [];
      const row = {
        id: newId(),
        code: input.code,
        environment: input.environment,
        version: input.version,
        saved_at: nowIso(),
        saved_by: input.savedBy,
        change_note: input.changeNote || "",
        batch_id: input.batchId || null,
        snapshot: input.snapshot,
      };
      data.versions.push(row);
      write(data);
      return versionRow(row);
    },
    async saveBatch(input) {
      const data = read();
      data.batches ||= [];
      const row = { id: newId(), ...input, created_at: nowIso() };
      data.batches.unshift(row);
      write(data);
      return row;
    },
  };
}

function versionPostgres(pool, ensure) {
  return {
    async latestVersion(code, environment) {
      await ensure();
      const result = await pool.query("SELECT version FROM record_versions WHERE code = $1 AND environment = $2 ORDER BY version DESC LIMIT 1", [code, environment]);
      return result.rows[0]?.version || 0;
    },
    async listVersions(code, environment) {
      await ensure();
      const result = await pool.query("SELECT id, code, environment, version, saved_at, saved_by, change_note, batch_id FROM record_versions WHERE code = $1 AND environment = $2 ORDER BY version DESC LIMIT 20", [code, environment]);
      return result.rows.map(versionRow);
    },
    async readVersion(code, environment, version) {
      await ensure();
      const result = await pool.query("SELECT * FROM record_versions WHERE code = $1 AND environment = $2 AND version = $3", [code, environment, version]);
      return versionRow(result.rows[0]);
    },
    async appendVersion(input) {
      await ensure();
      const row = {
        id: newId(),
        code: input.code,
        environment: input.environment,
        version: input.version,
        saved_at: nowIso(),
        saved_by: input.savedBy,
        change_note: input.changeNote || "",
        batch_id: input.batchId || null,
        snapshot: input.snapshot,
      };
      await pool.query("INSERT INTO record_versions (id, code, environment, version, saved_at, saved_by, change_note, batch_id, snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [row.id, row.code, row.environment, row.version, row.saved_at, row.saved_by, row.change_note, row.batch_id, row.snapshot]);
      return versionRow(row);
    },
    async saveBatch(input) {
      await ensure();
      const row = { id: newId(), ...input, created_at: nowIso() };
      await pool.query("INSERT INTO import_batches (id, environment, created_at, created_by, label, applied, unchanged, rejected) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [row.id, input.environment, row.created_at, input.createdBy, input.label, input.applied, input.unchanged, input.rejected]);
      return row;
    },
  };
}

export function openStore() {
  if (process.env.DATABASE_URL) return createPostgres(process.env.DATABASE_URL);
  if (process.env.VERCEL) return createMemory();
  return createFileStore();
}

export function validRole(role) {
  return ROLES.includes(role);
}

export function validEnvironment(environment) {
  return ENVIRONMENTS.includes(environment);
}

export function cleanEmail(value) {
  return normalizeEmail(value);
}
