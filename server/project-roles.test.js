import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createMemory } from "./store.js";
import { syntheticRecord } from "./risk-fixtures.js";

process.env.APP_ENV = "development";
process.env.ADMIN_EMAILS = "qa-admin@blackengtech.com";
const users = {
  administrator: "qa-admin@blackengtech.com", nstt: "qa-preparer@blackengtech.com",
  cpi: "qa-reviewer@alvarezandmarsal.com", trade: "qa-trade@blackengtech.com",
};

async function harness(t) {
  const store = createMemory();
  const sessions = {};
  for (const [role, email] of Object.entries(users)) {
    await store.grant({ email, role, environment: "development", grantedBy: users.administrator });
    sessions[role] = (await store.createSession(email, "synthetic-test")).id;
  }
  const server = createServer(createApp({ store }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (role, route, body) => {
    const response = await fetch(`${base}${route}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(sessions[role] ? { Cookie: `sid=${sessions[role]}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const created = await request("administrator", "/api/projects", { code: "QA", name: "Synthetic QA project" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const roster = async (projectId = "QA") => (await request("administrator", "/api/access/project-roles")).body.rosters[projectId];
  const assign = async (email, role, projectId = "QA") => request("administrator", "/api/access/project-roles", {
    projectId, email, role, version: (await roster(projectId))?.version ?? 0,
  });
  return { store, request, roster, assign };
}

test("only a designated administrator can read or change project roles", async t => {
  const h = await harness(t);
  assert.equal((await h.request(null, "/api/access/project-roles")).status, 401);
  for (const role of ["nstt", "cpi", "trade"]) {
    assert.equal((await h.request(role, "/api/access/project-roles")).status, 403);
    assert.equal((await h.request(role, "/api/access/project-roles", { projectId: "QA", email: users.cpi, role: "nstt", version: 0 })).status, 403);
  }
  const listing = await h.request("administrator", "/api/access/project-roles");
  assert.equal(listing.status, 200);
  assert.deepEqual(listing.body.projects.map(project => project.code), ["MDC", "QA"]);
  assert.deepEqual(listing.body.members.map(member => member.email).sort(), [users.cpi, users.nstt, users.trade].sort());
});

test("administrators, the caller, practice, unknown projects, and ungranted people are refused", async t => {
  const h = await harness(t);
  assert.equal((await h.assign(users.administrator, "nstt")).status, 403);
  assert.equal((await h.assign(users.cpi, "administrator")).status, 400);
  assert.equal((await h.assign(users.cpi, "nstt", "PRACTICE")).status, 400);
  assert.equal((await h.assign(users.cpi, "nstt", "NOPE")).status, 400);
  assert.equal((await h.assign("stranger@blackengtech.com", "nstt")).status, 400);
  const stale = await h.request("administrator", "/api/access/project-roles", { projectId: "QA", email: users.cpi, role: "nstt", version: 7 });
  assert.equal(stale.status, 409);
});

test("an assignment applies only to its project and can be reset to the default", async t => {
  const h = await harness(t);
  const assigned = await h.assign(users.cpi, "nstt");
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.equal(assigned.body.roster.version, 1);
  const session = await h.request("cpi", "/api/session");
  assert.deepEqual(session.body.projectRoles, { QA: "nstt" });
  assert.equal(session.body.role, "cpi");

  // The reviewer now prepares in QA but still cannot prepare in MDC.
  const inQa = await h.request("cpi", "/api/workbench/items", syntheticRecord({ code: "Q-21" }));
  assert.equal(inQa.status, 200, JSON.stringify(inQa.body));
  const inMdc = await h.request("cpi", "/api/workbench/items", syntheticRecord({ code: "Q-22", projectId: "MDC" }));
  assert.equal(inMdc.status, 403);

  // Moving a record into a project where the person holds a different role is refused.
  const moved = await h.request("cpi", "/api/workbench/items", { ...inQa.body, projectId: "MDC" });
  assert.equal(moved.status, 403);

  const reset = await h.assign(users.cpi, "");
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.body.roster.assignments, {});
  assert.deepEqual((await h.request("cpi", "/api/session")).body.projectRoles, {});
});

test("a project role controls review, import, and the administrator grant is untouched", async t => {
  const h = await harness(t);
  // The trade reviewer is assigned CPI in QA and can then validate and approve there.
  assert.equal((await h.assign(users.trade, "cpi")).status, 200);
  let result = await h.request("nstt", "/api/workbench/items", syntheticRecord({ code: "Q-31" }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  result = await h.request("nstt", "/api/workbench/items", { ...result.body, status: "In review" });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const approved = await h.request("trade", "/api/workbench/items", { ...result.body, status: "Approved" });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.status, "Approved");
  let mdc = await h.request("nstt", "/api/workbench/items", syntheticRecord({ code: "Q-32", projectId: "MDC" }));
  mdc = await h.request("nstt", "/api/workbench/items", { ...mdc.body, status: "In review" });
  assert.equal(mdc.status, 200, JSON.stringify(mdc.body));
  assert.equal((await h.request("trade", "/api/workbench/items", { ...mdc.body, status: "Approved" })).status, 403);

  // A CPI user assigned NSTT in QA can import QA rows and is refused for MDC rows.
  assert.equal((await h.assign(users.cpi, "nstt")).status, 200);
  const seed = await h.request("cpi", "/api/workbench/items", syntheticRecord({ code: "Q-41" }));
  assert.equal(seed.status, 200, JSON.stringify(seed.body));
  const qa = await h.request("cpi", "/api/workbench/import", { rows: [{ code: "Q-41", version: seed.body.version, title: "Synthetic import update" }] });
  assert.equal(qa.status, 200, JSON.stringify(qa.body));
  assert.equal(qa.body.applied, 1, JSON.stringify(qa.body));
  const mdcImport = await h.request("cpi", "/api/workbench/import", { rows: [{ code: "Q-42", version: 0, title: "New rows land in MDC" }] });
  assert.equal(mdcImport.status, 200);
  assert.equal(mdcImport.body.applied, 0);
  assert.match(mdcImport.body.results[0].message || "", /not NSTT/);
  assert.equal((await h.request("trade", "/api/workbench/import", { rows: [{ code: "Q-43", title: "x" }] })).status, 403);

  const grants = await h.store.listGrants("development");
  assert.equal(grants.find(grant => grant.email === users.administrator).role, "administrator");
  assert.equal((await h.request("administrator", "/api/session")).body.role, "administrator");
  assert.deepEqual((await h.request("administrator", "/api/session")).body.projectRoles, {});
});
