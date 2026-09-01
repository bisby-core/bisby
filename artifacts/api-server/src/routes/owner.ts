import { Router, type IRouter } from "express";
import {
  OwnerLoginBody,
  ProvisionTenantBody,
} from "./schemas";
import {
  clearOwnerSessionCookie,
  createOwnerSessionToken,
  serializeOwnerSessionCookie,
} from "../owner/session";
import {
  isRootHost,
  requireOwnerSession,
  usesSecureCookie,
} from "../owner/auth";
import {
  getControlPlaneSnapshot,
  recordPlatformAudit,
} from "../owner/control-plane";
import { provisionTenant, TenantProvisioningError } from "../owner/provisioning";
import { timingSafeEqual } from "node:crypto";
import type { Knex } from "knex";

function configuredOwnerCredential(name: "BISBY_OWNER_USERNAME" | "BISBY_OWNER_PASSWORD"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured for owner access.`);
  }
  return value;
}

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function ownerRouter(
  masterDatabase: Knex,
  rootDomain: string,
): IRouter {
  const router: IRouter = Router();

  router.use((req, res, next) => {
    if (!isRootHost(req.hostname, rootDomain)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    next();
  });

  router.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }

    const source = req.get("origin") ?? req.get("referer");
    let sourceIsRoot = false;
    if (source) {
      try {
        sourceIsRoot = isRootHost(new URL(source).hostname, rootDomain);
      } catch {
        sourceIsRoot = false;
      }
    }

    if (
      !sourceIsRoot ||
      req.get("x-bisby-owner-request") !== "1"
    ) {
      res.status(403).json({ error: "owner_request_origin_rejected" });
      return;
    }
    next();
  });

  router.post("/login", async (req, res, next) => {
    const parsed = OwnerLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_owner_credentials_payload" });
      return;
    }

    try {
      const valid =
        equalSecret(parsed.data.username, configuredOwnerCredential("BISBY_OWNER_USERNAME")) &&
        equalSecret(parsed.data.password, configuredOwnerCredential("BISBY_OWNER_PASSWORD"));
      if (!valid) {
        res.status(401).json({ error: "invalid_owner_credentials" });
        return;
      }

      const token = createOwnerSessionToken(parsed.data.username);
      res.setHeader(
        "Set-Cookie",
        serializeOwnerSessionCookie(token, usesSecureCookie(req)),
      );
      res.json({ authenticated: true, username: parsed.data.username });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (req, res) => {
    res.setHeader("Set-Cookie", clearOwnerSessionCookie(usesSecureCookie(req)));
    res.json({ authenticated: false });
  });

  router.get("/me", (req, res) => {
    if (!requireOwnerSession(req, res)) return;
    res.json({ authenticated: true, username: req.ownerUsername });
  });

  router.get("/control-plane", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    try {
      await recordPlatformAudit(masterDatabase, {
        eventType: "owner.control_plane.viewed",
        actorUsername: req.ownerUsername as string,
      });
      res.json(await getControlPlaneSnapshot(masterDatabase));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "42P01"
      ) {
        res.status(503).json({ error: "master_migration_required" });
        return;
      }
      next(error);
    }
  });

  router.post("/tenants/provision", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const parsed = ProvisionTenantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_tenant_provisioning_payload",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await provisionTenant(
        masterDatabase,
        req.ownerUsername as string,
        parsed.data,
      );
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof TenantProvisioningError) {
        res.status(409).json({
          error: "tenant_provisioning_failed",
          message: error.message,
          stage: error.stage,
        });
        return;
      }
      next(error);
    }
  });

  return router;
}

export default ownerRouter;
