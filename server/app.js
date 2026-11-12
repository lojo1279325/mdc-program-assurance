import express from "express";
import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import {
  currentEnvironment,
  decideAccess,
  designatedAdministrators,
  isAllowedDomain,
} from "./policy.js";
import { cleanEmail, openStore, validEnvironment, validRole } from "./store.js";

const store = openStore();

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function writeCookie(res, name, value, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (process.env.APP_ORIGIN?.startsWith("https://")) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function publicSession(extra = {}) {
  return {
    state: "anonymous",
    environment: currentEnvironment(),
    providers: {
      google: Boolean(process.env.APP_ORIGIN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    domains: ["blackengtech.com", "alvarezandmarsal.com"],
    database: store.kind,
    ...extra,
  };
}

async function sessionFrom(req) {
  const id = readCookie(req, "sid");
  if (!id) return null;
  return store.readSession(id);
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      name: "MDC Program Assurance",
      environment: currentEnvironment(),
      database: store.kind,
    });
  });

  app.get("/api/session", async (req, res) => {
    const session = await sessionFrom(req);
    if (!session || !isAllowedDomain(session.email)) {
      res.json(publicSession());
      return;
    }
    const environment = currentEnvironment();
    const grant = await store.activeGrant(session.email, environment);
    const decision = decideAccess({
      email: session.email,
      emailVerified: true,
      grantRole: grant?.role || null,
      grantRevoked: Boolean(grant?.revoked_at),
    });
    res.json(publicSession({
      state: decision === "granted" ? "granted" : "pending",
      email: session.email,
      role: decision === "granted" ? grant.role : null,
      administrator: designatedAdministrators().includes(session.email) || grant?.role === "administrator",
    }));
  });

  app.get("/api/auth/google/start", (req, res) => {
    const origin = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
    if (!origin || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      res.status(503).json({ message: "Google sign-in is not connected yet." });
      return;
    }
    const state = randomBytes(16).toString("hex");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
    writeCookie(res, "oauth_state", state, 600);
    res.redirect(client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account",
    }));
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const origin = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
    const saved = readCookie(req, "oauth_state");
    writeCookie(res, "oauth_state", "", 0);
    if (!origin || !saved || saved !== req.query.state || !req.query.code) {
      res.redirect("/?error=signin");
      return;
    }
    try {
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
      const { tokens } = await client.getToken(String(req.query.code));
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = cleanEmail(payload?.email);
      if (!email || payload.email_verified !== true || !isAllowedDomain(email)) {
        res.redirect("/?error=domain");
        return;
      }
      const session = await store.createSession(email, "google");
      writeCookie(res, "sid", session.id, 8 * 60 * 60);
      res.redirect("/");
    } catch {
      res.redirect("/?error=signin");
    }
  });

  app.post("/api/auth/sign-out", async (req, res) => {
    const id = readCookie(req, "sid");
    if (id) await store.deleteSession(id);
    writeCookie(res, "sid", "", 0);
    res.json({ ok: true });
  });

  app.get("/api/items", async (req, res) => {
    const session = await sessionFrom(req);
    const environment = currentEnvironment();
    const grant = session ? await store.activeGrant(session.email, environment) : null;
    const decision = decideAccess({
      email: session?.email || "",
      emailVerified: Boolean(session),
      grantRole: grant?.role || null,
      grantRevoked: Boolean(grant?.revoked_at),
    });
    if (!session) {
      res.status(401).json({ message: "Sign-in is required." });
      return;
    }
    if (decision !== "granted") {
      res.status(403).json({ message: "An administrator has not granted a role for this environment." });
      return;
    }
    res.json({ environment, items: await store.listItems(environment) });
  });

  app.post("/api/items", async (req, res) => {
    const session = await sessionFrom(req);
    const environment = currentEnvironment();
    const grant = session ? await store.activeGrant(session.email, environment) : null;
    if (!session || !grant || grant.revoked_at) {
      res.status(401).json({ message: "Sign-in is required." });
      return;
    }
    const code = String(req.body?.code || "").trim();
    const status = String(req.body?.status || "Open").trim();
    const note = String(req.body?.note || "");
    if (!/^[A-Z]-\d{2}$/.test(code) || status.length > 40 || note.length > 2000) {
      res.status(400).json({ message: "The record was not saved." });
      return;
    }
    const item = await store.saveItem({ code, kind: "record", status, note, environment });
    res.json(item);
  });

  app.post("/api/access/grants", async (req, res) => {
    const session = await sessionFrom(req);
    if (!session || !designatedAdministrators().includes(session.email)) {
      res.status(403).json({ message: "Only a designated administrator can grant a role." });
      return;
    }
    const email = cleanEmail(req.body?.email);
    const role = String(req.body?.role || "");
    const environment = String(req.body?.environment || currentEnvironment());
    if (!email || !isAllowedDomain(email) || !validRole(role) || !validEnvironment(environment)) {
      res.status(400).json({ message: "The grant was not saved. Use an allowed domain, a known role, and one environment." });
      return;
    }
    if (role === "administrator" && !designatedAdministrators().includes(session.email)) {
      res.status(403).json({ message: "Only a designated administrator can grant the administrator role." });
      return;
    }
    res.json(await store.grant({ email, role, environment, grantedBy: session.email }));
  });

  app.get("/api/access/grants", async (req, res) => {
    const session = await sessionFrom(req);
    if (!session || !designatedAdministrators().includes(session.email)) {
      res.status(403).json({ message: "Only a designated administrator can review grants." });
      return;
    }
    const environment = validEnvironment(req.query.environment) ? String(req.query.environment) : currentEnvironment();
    res.json({ environment, grants: await store.listGrants(environment) });
  });

  return app;
}
