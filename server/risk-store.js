import { randomBytes } from "node:crypto";

export const RISK_SCHEMA = `
CREATE TABLE IF NOT EXISTS risk_documents (
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
CREATE INDEX IF NOT EXISTS risk_documents_project ON risk_documents (environment, project_id, kind);
CREATE TABLE IF NOT EXISTS risk_document_versions (
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

export function riskMemory() {
  const data = { riskDocuments: [], riskHistory: [] };
  return riskFile(() => data, () => {});
}

export function riskFile(read, write) {
  return {
    async listRiskDocuments(environment, projectId = "") {
      return (read().riskDocuments || []).filter(row => row.environment === environment && (!projectId || row.project_id === projectId)).map(unpack);
    },
    async readRiskDocument(environment, kind, key) {
      return unpack((read().riskDocuments || []).find(row => row.environment === environment && row.kind === kind && row.key === key));
    },
    async listRiskHistory(environment, kind, key) {
      return (read().riskHistory || []).filter(row => row.environment === environment && row.kind === kind && row.key === key).sort((a, b) => b.version - a.version).slice(0, 30).map(unpack);
    },
    async saveRiskDocument(input) {
      const data = read();
      data.riskDocuments ||= [];
      data.riskHistory ||= [];
      const index = data.riskDocuments.findIndex(row => row.environment === input.environment && row.kind === input.kind && row.key === input.key);
      const existing = data.riskDocuments[index];
      if ((existing?.version || 0) !== input.expectedVersion) return null;
      const row = rowFor(input);
      if (index >= 0) data.riskDocuments[index] = row;
      else data.riskDocuments.push(row);
      data.riskHistory.push({ ...row, id: randomBytes(18).toString("hex") });
      write(data);
      return unpack(row);
    },
  };
}

export function riskPostgres(pool, ensure) {
  return {
    async listRiskDocuments(environment, projectId = "") {
      await ensure();
      const result = await pool.query("SELECT * FROM risk_documents WHERE environment = $1 AND ($2 = '' OR project_id = $2) ORDER BY kind, key", [environment, projectId]);
      return result.rows.map(unpack);
    },
    async readRiskDocument(environment, kind, key) {
      await ensure();
      const result = await pool.query("SELECT * FROM risk_documents WHERE environment = $1 AND kind = $2 AND key = $3", [environment, kind, key]);
      return unpack(result.rows[0]);
    },
    async listRiskHistory(environment, kind, key) {
      await ensure();
      const result = await pool.query("SELECT * FROM risk_document_versions WHERE environment = $1 AND kind = $2 AND key = $3 ORDER BY version DESC LIMIT 30", [environment, kind, key]);
      return result.rows.map(unpack);
    },
    async saveRiskDocument(input) {
      await ensure();
      const row = rowFor(input);
      // One statement atomically performs optimistic locking and appends history.
      const result = await pool.query(`
        WITH saved AS (
          INSERT INTO risk_documents (environment, kind, key, project_id, version, saved_at, saved_by, payload)
          SELECT $1, $2, $3, $4, $5, $6, $7, $8
          WHERE $9 = 0 OR EXISTS (
            SELECT 1 FROM risk_documents WHERE environment = $1 AND kind = $2 AND key = $3
          )
          ON CONFLICT (environment, kind, key) DO UPDATE SET
            version = EXCLUDED.version, saved_at = EXCLUDED.saved_at,
            saved_by = EXCLUDED.saved_by, payload = EXCLUDED.payload
          WHERE risk_documents.version = $9
          RETURNING *
        ), history AS (
          INSERT INTO risk_document_versions (id, environment, kind, key, project_id, version, saved_at, saved_by, payload)
          SELECT $10, environment, kind, key, project_id, version, saved_at, saved_by, payload FROM saved
          RETURNING id
        )
        SELECT saved.* FROM saved, history`,
      [row.environment, row.kind, row.key, row.project_id, row.version, row.saved_at, row.saved_by, row.payload, input.expectedVersion, randomBytes(18).toString("hex")]);
      return unpack(result.rows[0]);
    },
  };
}
