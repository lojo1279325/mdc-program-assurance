import { designatedAdministrators } from "./policy.js";
import { cleanEmail } from "./store.js";
import { BUILT_IN_PROJECT, cleanProjectId } from "../public/boards.js";
import { PRACTICE_PROJECT } from "./practice.js";

// A project assignment narrows or changes a team member's working role for
// one project. The environment grant still decides whether the person can
// sign in at all, and an administrator grant is never replaced.
export const PROJECT_ROLES = ["nstt", "cpi", "trade"];
const KIND = "roster";

function assignmentsOf(document) {
  const raw = document?.payload?.assignments;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).filter(([email, role]) => cleanEmail(email) && PROJECT_ROLES.includes(role)));
}

export async function effectiveRole(store, environment, email, grantRole, projectId) {
  const project = cleanProjectId(projectId);
  if (!grantRole || grantRole === "administrator" || project === PRACTICE_PROJECT) return grantRole;
  const document = await store.readRiskDocument(environment, KIND, project);
  return assignmentsOf(document)[email] || grantRole;
}

export async function projectRolesFor(store, environment, email, grantRole) {
  if (!grantRole || grantRole === "administrator") return {};
  const documents = (await store.listRiskDocuments(environment)).filter((doc) => doc.kind === KIND);
  const roles = {};
  for (const document of documents) {
    const role = assignmentsOf(document)[email];
    if (role) roles[document.projectId] = role;
  }
  return roles;
}

export async function anyProjectRole(store, environment, email, grantRole, role) {
  if (grantRole === role) return true;
  return Object.values(await projectRolesFor(store, environment, email, grantRole)).includes(role);
}

export function registerProjectRoleRoutes(app, { store, grantedActor }) {
  async function administrator(req, res) {
    const actor = await grantedActor(req);
    if (actor.error) { res.status(actor.error).json({ message: actor.message }); return null; }
    if (actor.grant.role !== "administrator" || !designatedAdministrators().includes(actor.session.email)) {
      res.status(403).json({ message: "Only a designated administrator can assign project roles." });
      return null;
    }
    return actor;
  }

  async function projects(environment) {
    const saved = await store.listProjects(environment);
    return [BUILT_IN_PROJECT, ...saved.filter((project) => project.code !== "MDC")]
      .filter((project) => project.code !== PRACTICE_PROJECT)
      .map((project) => ({ code: project.code, name: project.name }));
  }

  app.get("/api/access/project-roles", async (req, res) => {
    const actor = await administrator(req, res);
    if (!actor) return;
    const grants = (await store.listGrants(actor.environment)).filter((grant) => !grant.revokedAt);
    const admins = new Set(designatedAdministrators());
    const documents = (await store.listRiskDocuments(actor.environment)).filter((doc) => doc.kind === KIND);
    const list = await projects(actor.environment);
    const rosters = {};
    for (const project of list) {
      const document = documents.find((doc) => doc.key === project.code);
      rosters[project.code] = { version: document?.version || 0, assignments: assignmentsOf(document), savedAt: document?.savedAt || "", savedBy: document?.savedBy || "" };
    }
    res.json({
      environment: actor.environment,
      projects: list,
      members: grants.filter((grant) => grant.role !== "administrator" && !admins.has(grant.email)).map((grant) => ({ email: grant.email, role: grant.role })),
      administrators: grants.filter((grant) => grant.role === "administrator" || admins.has(grant.email)).length,
      rosters,
    });
  });

  app.post("/api/access/project-roles", async (req, res) => {
    const actor = await administrator(req, res);
    if (!actor) return;
    const projectId = cleanProjectId(req.body?.projectId);
    const email = cleanEmail(req.body?.email);
    const role = String(req.body?.role || "");
    const expectedVersion = Number(req.body?.version ?? -1);
    if (!projectId || projectId === PRACTICE_PROJECT || !(await projects(actor.environment)).some((project) => project.code === projectId)) {
      res.status(400).json({ message: "Choose an existing project. The practice project uses practice roles instead." });
      return;
    }
    if (!email || (role && !PROJECT_ROLES.includes(role))) {
      res.status(400).json({ message: "Choose a team member and NSTT, CPI, Trade, or the default role." });
      return;
    }
    if (email === actor.session.email || designatedAdministrators().includes(email)) {
      res.status(403).json({ message: "Administrators manage access and do not take a working role." });
      return;
    }
    const grant = await store.activeGrant(email, actor.environment);
    if (!grant || grant.revoked_at) {
      res.status(400).json({ message: "Grant this person access to the environment before assigning a project role." });
      return;
    }
    if (grant.role === "administrator") {
      res.status(403).json({ message: "Administrators manage access and do not take a working role." });
      return;
    }
    const current = await store.readRiskDocument(actor.environment, KIND, projectId);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== (current?.version || 0)) {
      res.status(409).json({ message: "Project roles changed in another session. Refresh and try again." });
      return;
    }
    const assignments = { ...assignmentsOf(current) };
    if (!role || role === grant.role) delete assignments[email];
    else assignments[email] = role;
    const saved = await store.saveRiskDocument({
      environment: actor.environment, projectId, kind: KIND, key: projectId,
      expectedVersion, savedBy: actor.session.email, payload: { assignments },
    });
    if (!saved) {
      res.status(409).json({ message: "Project roles changed in another session. Refresh and try again." });
      return;
    }
    res.json({ projectId, roster: { version: saved.version, assignments: assignmentsOf(saved), savedAt: saved.savedAt || "", savedBy: saved.savedBy || "" } });
  });
}
