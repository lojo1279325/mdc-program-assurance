import { randomBytes } from "node:crypto";

export const GUIDE_SCHEMA = `
CREATE TABLE IF NOT EXISTS guide_documents (
  environment TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  saved_by TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (environment, kind, key)
);
CREATE INDEX IF NOT EXISTS guide_documents_project ON guide_documents (environment, project_id, kind);
CREATE TABLE IF NOT EXISTS guide_document_versions (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  saved_by TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (environment, kind, key, version)
);`;

function unpack(row) {
  if (!row) return null;
  return {
    key: row.key, kind: row.kind, projectId: row.project_id, environment: row.environment,
    version: row.version, savedAt: row.saved_at, savedBy: row.saved_by,
    payload: JSON.parse(row.payload),
  };
}

function rowFor(input) {
  return {
    environment: input.environment, kind: input.kind, key: input.key, project_id: input.projectId,
    version: input.expectedVersion + 1, saved_at: new Date().toISOString(), saved_by: input.savedBy,
    payload: JSON.stringify(input.payload),
  };
}

function kindList(options) {
  const kinds = [].concat(options?.kinds || options?.kind || []).map(String).filter(Boolean);
  return kinds.length ? kinds : null;
}
const safeLimit = (value) => Math.max(1, Math.min(500, Math.trunc(Number(value)) || 1));

export function guideMemory() {
  const data = { guideDocuments: [], guideHistory: [] };
  return guideFile(() => data, () => {});
}

export function guideFile(read, write) {
  return {
    // options.kinds narrows the list. options.limit returns the newest documents first.
    async listGuideDocuments(environment, projectId = "", options = {}) {
      const kinds = kindList(options);
      const rows = (read().guideDocuments || []).filter(row => row.environment === environment && (!projectId || row.project_id === projectId) && (!kinds || kinds.includes(row.kind)));
      if (!options.limit) return rows.map(unpack);
      return [...rows].sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at))).slice(0, safeLimit(options.limit)).map(unpack);
    },
    async readGuideDocument(environment, kind, key) {
      return unpack((read().guideDocuments || []).find(row => row.environment === environment && row.kind === kind && row.key === key));
    },
    async listGuideHistory(environment, kind, key) {
      return (read().guideHistory || []).filter(row => row.environment === environment && row.kind === kind && row.key === key).sort((a, b) => b.version - a.version).slice(0, 30).map(unpack);
    },
    async saveGuideDocument(input) {
      const data = read();
      data.guideDocuments ||= [];
      data.guideHistory ||= [];
      const index = data.guideDocuments.findIndex(row => row.environment === input.environment && row.kind === input.kind && row.key === input.key);
      const existing = data.guideDocuments[index];
      if ((existing?.version || 0) !== input.expectedVersion) return null;
      const row = rowFor(input);
      if (index >= 0) data.guideDocuments[index] = row;
      else data.guideDocuments.push(row);
      data.guideHistory.push({ ...row, id: randomBytes(18).toString("hex") });
      write(data);
      return unpack(row);
    },
  };
}

export function guidePostgres(pool, ensure) {
  return {
    async listGuideDocuments(environment, projectId = "", options = {}) {
      await ensure();
      const kinds = kindList(options);
      const where = "environment = $1 AND ($2 = '' OR project_id = $2) AND ($3::text[] IS NULL OR kind = ANY($3::text[]))";
      const result = options.limit
        ? await pool.query(`SELECT * FROM guide_documents WHERE ${where} ORDER BY saved_at DESC LIMIT $4`, [environment, projectId, kinds, safeLimit(options.limit)])
        : await pool.query(`SELECT * FROM guide_documents WHERE ${where} ORDER BY kind, key`, [environment, projectId, kinds]);
      return result.rows.map(unpack);
    },
    async readGuideDocument(environment, kind, key) {
      await ensure();
      const result = await pool.query("SELECT * FROM guide_documents WHERE environment = $1 AND kind = $2 AND key = $3", [environment, kind, key]);
      return unpack(result.rows[0]);
    },
    async listGuideHistory(environment, kind, key) {
      await ensure();
      const result = await pool.query("SELECT * FROM guide_document_versions WHERE environment = $1 AND kind = $2 AND key = $3 ORDER BY version DESC LIMIT 30", [environment, kind, key]);
      return result.rows.map(unpack);
    },
    async saveGuideDocument(input) {
      await ensure();
      const row = rowFor(input);
      // One statement atomically performs optimistic locking and appends history.
      const result = await pool.query(`
        WITH saved AS (
          INSERT INTO guide_documents (environment, kind, key, project_id, version, saved_at, saved_by, payload)
          SELECT $1, $2, $3, $4, $5, $6, $7, $8
          WHERE $9 = 0 OR EXISTS (
            SELECT 1 FROM guide_documents WHERE environment = $1 AND kind = $2 AND key = $3
          )
          ON CONFLICT (environment, kind, key) DO UPDATE SET
            version = EXCLUDED.version, saved_at = EXCLUDED.saved_at,
            saved_by = EXCLUDED.saved_by, payload = EXCLUDED.payload
          WHERE guide_documents.version = $9
          RETURNING *
        ), history AS (
          INSERT INTO guide_document_versions (id, environment, kind, key, project_id, version, saved_at, saved_by, payload)
          SELECT $10, environment, kind, key, project_id, version, saved_at, saved_by, payload FROM saved
          RETURNING id
        )
        SELECT saved.* FROM saved, history`,
      [row.environment, row.kind, row.key, row.project_id, row.version, row.saved_at, row.saved_by, row.payload, input.expectedVersion, randomBytes(18).toString("hex")]);
      return unpack(result.rows[0]);
    },
  };
}
