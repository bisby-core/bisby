import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { parseTenantSubdomain } from "../tenancy/subdomain";
import { getSessionSecret } from "../auth/session";
import { createMasterDatabase } from "../db/knex";
import { listAuditEntries, listOwnerTenants, recordOwnerAudit } from "../owner/control-plane";
import {
  clearOwnerSessionCookie,
  createOwnerSession,
  getOwnerCredentials,
  ownerSessionCookie,
  ownerSessionFromRequest,
} from "../owner/session";

const router: IRouter = Router();
const isSecure = (request: { secure: boolean }) => process.env["NODE_ENV"] === "production" || request.secure;

router.use((req, res, next) => {
  const parsedHost = parseTenantSubdomain(req.hostname, process.env["BISBY_ROOT_DOMAIN"] ?? "bisby.pro");
  if (parsedHost.kind === "tenant") {
    res.status(404).json({ error: "owner_route_not_found" });
    return;
  }
  next();
});

function requireOwner(req: Request, res: Response): string | null {
  const session = ownerSessionFromRequest(req.headers.cookie, getSessionSecret());
  if (!session) {
    res.status(401).json({ error: "authentication_required" });
    return null;
  }
  return session.username;
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

router.post("/owner/login", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const credentials = getOwnerCredentials();
  if (!credentials || !sameValue(username, credentials.username) || !sameValue(password, credentials.password)) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const token = createOwnerSession(credentials.username, getSessionSecret());
  res.setHeader("Set-Cookie", ownerSessionCookie(token, isSecure(req)));
  res.json({ username: credentials.username });
});

router.get("/owner/control-plane", async (req, res, next) => {
  const username = requireOwner(req, res);
  if (!username) return;
  const database = createMasterDatabase();
  try {
    const [tenants, audit] = await Promise.all([listOwnerTenants(database), listAuditEntries(database)]);
    await recordOwnerAudit(database, { actorUsername: username, action: "owner.control_plane.viewed" });
    res.json({ tenants, audit });
  } catch (error) {
    next(error);
  } finally {
    await database.destroy();
  }
});

router.get("/owner/me", (req, res) => {
  const session = ownerSessionFromRequest(req.headers.cookie, getSessionSecret());
  if (!session) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  res.json({ username: session.username });
});

router.post("/owner/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearOwnerSessionCookie(isSecure(req)));
  res.json({ authenticated: false });
});

export default router;
