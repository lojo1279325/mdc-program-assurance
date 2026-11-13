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
CREATE INDEX IF NOT EXISTS source_lookups_subject ON source_lookups (environment, subject_key, observed_at);`;

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
    ...catalogMemory(),
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
    ...catalogFile(read, write),
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
    ...catalogPostgres(pool, ensure),
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

function mapProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    ownerEmail: row.owner_email || "",
    note: row.note || "",
    createdAt: row.created_at,
    createdBy: row.created_by,
    environment: row.environment,
  };
}

function mapVendor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    country: row.country || "",
    identifier: row.identifier || "",
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPart(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    drawing: row.drawing || "",
    vendorName: row.vendor_name || "",
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLookup(row) {
  if (!row) return null;
  return {
    id: row.id,
    subjectKey: row.subject_key,
    source: row.source,
    observedAt: row.observed_at,
    status: row.status,
    summary: row.summary,
    payload: row.payload,
  };
}

function catalogMemory() {
  const projects = [];
  const vendors = [];
  const parts = [];
  const lookups = [];
  return {
    async listProjects(environment) {
      return projects.filter((row) => row.environment === environment).map(mapProject);
    },
    async saveProject(input) {
      if (projects.some((row) => row.environment === input.environment && row.code === input.code)) return null;
      const row = {
        id: newId(),
        environment: input.environment,
        code: input.code,
        name: input.name,
        status: input.status || "Active",
        owner_email: input.ownerEmail || "",
        note: input.note || "",
        created_at: nowIso(),
        created_by: input.createdBy,
      };
      projects.unshift(row);
      return mapProject(row);
    },
    async listVendors(environment) {
      return vendors.filter((row) => row.environment === environment).map(mapVendor);
    },
    async saveVendor(input) {
      const existing = vendors.find((row) => row.environment === input.environment && row.name_key === input.nameKey);
      if (existing) {
        existing.name = input.name;
        existing.country = input.country || "";
        existing.identifier = input.identifier || "";
        existing.note = input.note || "";
        existing.updated_at = nowIso();
        return mapVendor(existing);
      }
      const row = {
        id: newId(),
        environment: input.environment,
        name: input.name,
        name_key: input.nameKey,
        country: input.country || "",
        identifier: input.identifier || "",
        note: input.note || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      vendors.unshift(row);
      return mapVendor(row);
    },
    async listParts(environment) {
      return parts.filter((row) => row.environment === environment).map(mapPart);
    },
    async savePart(input) {
      const existing = parts.find((row) => row.environment === input.environment && row.code === input.code);
      if (existing) {
        existing.name = input.name;
        existing.drawing = input.drawing || "";
        existing.vendor_name = input.vendorName || "";
        existing.note = input.note || "";
        existing.updated_at = nowIso();
        return mapPart(existing);
      }
      const row = {
        id: newId(),
        environment: input.environment,
        code: input.code,
        name: input.name,
        drawing: input.drawing || "",
        vendor_name: input.vendorName || "",
        note: input.note || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      parts.unshift(row);
      return mapPart(row);
    },
    async listLookups(environment, subjectKey) {
      return lookups.filter((row) => row.environment === environment && (!subjectKey || row.subject_key === subjectKey)).slice(0, 20).map(mapLookup);
    },
    async saveLookup(input) {
      const row = {
        id: newId(),
        environment: input.environment,
        subject_key: input.subjectKey,
        source: input.source,
        observed_at: input.observedAt || nowIso(),
        status: input.status,
        summary: input.summary,
        payload: input.payload || "{}",
      };
      lookups.unshift(row);
      return mapLookup(row);
    },
  };
}

function catalogFile(read, write) {
  const data = () => {
    const current = read();
    current.projects ||= [];
    current.vendors ||= [];
    current.parts ||= [];
    current.lookups ||= [];
    return current;
  };
  return {
    async listProjects(environment) {
      return data().projects.filter((row) => row.environment === environment).map(mapProject);
    },
    async saveProject(input) {
      const current = data();
      if (current.projects.some((row) => row.environment === input.environment && row.code === input.code)) return null;
      const row = {
        id: newId(),
        environment: input.environment,
        code: input.code,
        name: input.name,
        status: input.status || "Active",
        owner_email: input.ownerEmail || "",
        note: input.note || "",
        created_at: nowIso(),
        created_by: input.createdBy,
      };
      current.projects.unshift(row);
      write(current);
      return mapProject(row);
    },
    async listVendors(environment) {
      return data().vendors.filter((row) => row.environment === environment).map(mapVendor);
    },
    async saveVendor(input) {
      const current = data();
      const existing = current.vendors.find((row) => row.environment === input.environment && row.name_key === input.nameKey);
      if (existing) {
        existing.name = input.name;
        existing.country = input.country || "";
        existing.identifier = input.identifier || "";
        existing.note = input.note || "";
        existing.updated_at = nowIso();
        write(current);
        return mapVendor(existing);
      }
      const row = {
        id: newId(),
        environment: input.environment,
        name: input.name,
        name_key: input.nameKey,
        country: input.country || "",
        identifier: input.identifier || "",
        note: input.note || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      current.vendors.unshift(row);
      write(current);
      return mapVendor(row);
    },
    async listParts(environment) {
      return data().parts.filter((row) => row.environment === environment).map(mapPart);
    },
    async savePart(input) {
      const current = data();
      const existing = current.parts.find((row) => row.environment === input.environment && row.code === input.code);
      if (existing) {
        existing.name = input.name;
        existing.drawing = input.drawing || "";
        existing.vendor_name = input.vendorName || "";
        existing.note = input.note || "";
        existing.updated_at = nowIso();
        write(current);
        return mapPart(existing);
      }
      const row = {
        id: newId(),
        environment: input.environment,
        code: input.code,
        name: input.name,
        drawing: input.drawing || "",
        vendor_name: input.vendorName || "",
        note: input.note || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      current.parts.unshift(row);
      write(current);
      return mapPart(row);
    },
    async listLookups(environment, subjectKey) {
      return data().lookups.filter((row) => row.environment === environment && (!subjectKey || row.subject_key === subjectKey)).slice(0, 20).map(mapLookup);
    },
    async saveLookup(input) {
      const current = data();
      const row = {
        id: newId(),
        environment: input.environment,
        subject_key: input.subjectKey,
        source: input.source,
        observed_at: input.observedAt || nowIso(),
        status: input.status,
        summary: input.summary,
        payload: input.payload || "{}",
      };
      current.lookups.unshift(row);
      write(current);
      return mapLookup(row);
    },
  };
}

function catalogPostgres(pool, ensure) {
  return {
    async listProjects(environment) {
      await ensure();
      const result = await pool.query("SELECT * FROM projects WHERE environment = $1 ORDER BY created_at DESC", [environment]);
      return result.rows.map(mapProject);
    },
    async saveProject(input) {
      await ensure();
      const existing = await pool.query("SELECT id FROM projects WHERE environment = $1 AND code = $2", [input.environment, input.code]);
      if (existing.rows[0]) return null;
      const row = {
        id: newId(),
        environment: input.environment,
        code: input.code,
        name: input.name,
        status: input.status || "Active",
        owner_email: input.ownerEmail || "",
        note: input.note || "",
        created_at: nowIso(),
        created_by: input.createdBy,
      };
      await pool.query("INSERT INTO projects (id, environment, code, name, status, owner_email, note, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [row.id, row.environment, row.code, row.name, row.status, row.owner_email, row.note, row.created_at, row.created_by]);
      return mapProject(row);
    },
    async listVendors(environment) {
      await ensure();
      const result = await pool.query("SELECT * FROM vendors WHERE environment = $1 ORDER BY name", [environment]);
      return result.rows.map(mapVendor);
    },
    async saveVendor(input) {
      await ensure();
      const row = {
        id: newId(),
        environment: input.environment,
        name: input.name,
        name_key: input.nameKey,
        country: input.country || "",
        identifier: input.identifier || "",
        note: input.note || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const result = await pool.query(`INSERT INTO vendors (id, environment, name, name_key, country, identifier, note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (environment, name_key) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, identifier = EXCLUDED.identifier, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at
        RETURNING *`, [row.id, row.environment, row.name, row.name_key, row.country, row.identifier, row.note, row.created_at, row.updated_at]);
      return mapVendor(result.rows[0]);
    },
    async listParts(environment) {
      await ensure();
      const result = await pool.query("SELECT * FROM parts WHERE environment = $1 ORDER BY code", [environment]);
      return result.rows.map(mapPart);
    },
    async savePart(input) {
      await ensure();
      const row = {
        id: newId(),
        environment: input.environment,
        code: input.code,
        name: input.name,
        drawing: input.drawing || "",
        vendor_name: input.vendorName || "",
        note: input.note || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const result = await pool.query(`INSERT INTO parts (id, environment, code, name, drawing, vendor_name, note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (environment, code) DO UPDATE SET name = EXCLUDED.name, drawing = EXCLUDED.drawing, vendor_name = EXCLUDED.vendor_name, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at
        RETURNING *`, [row.id, row.environment, row.code, row.name, row.drawing, row.vendor_name, row.note, row.created_at, row.updated_at]);
      return mapPart(result.rows[0]);
    },
    async listLookups(environment, subjectKey) {
      await ensure();
      const result = subjectKey
        ? await pool.query("SELECT * FROM source_lookups WHERE environment = $1 AND subject_key = $2 ORDER BY observed_at DESC LIMIT 20", [environment, subjectKey])
        : await pool.query("SELECT * FROM source_lookups WHERE environment = $1 ORDER BY observed_at DESC LIMIT 20", [environment]);
      return result.rows.map(mapLookup);
    },
    async saveLookup(input) {
      await ensure();
      const row = {
        id: newId(),
        environment: input.environment,
        subject_key: input.subjectKey,
        source: input.source,
        observed_at: input.observedAt || nowIso(),
        status: input.status,
        summary: input.summary,
        payload: input.payload || "{}",
      };
      await pool.query("INSERT INTO source_lookups (id, environment, subject_key, source, observed_at, status, summary, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [row.id, row.environment, row.subject_key, row.source, row.observed_at, row.status, row.summary, row.payload]);
      return mapLookup(row);
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
