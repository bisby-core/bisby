import { Router, type IRouter } from "express";
import {
  OwnerLoginBody,
  OwnerTenantIdParams,
  OwnerTenantAdministratorParams,
  OwnerTenantModuleParams,
  OwnerTenantAdministratorCreateBody,
  OwnerTenantAdministratorResetBody,
  OwnerToggleBody,
  ProvisionTenantBody,
  WorkspaceMetadataBody,
  OwnerWorkspaceParams,
  WorkspaceAccessBody,
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
  OwnerControlPlaneError,
  recordPlatformAudit,
  updateTenantModule,
  updateTenantStatus,
} from "../owner/control-plane";
import { provisionTenant, TenantProvisioningError } from "../owner/provisioning";
import {
  listTenantAdministrators,
  createTenantAdministrator,
  resetTenantAdministratorCredentials,
  TenantAdministratorError,
  updateTenantAdministratorStatus,
} from "../owner/tenant-administrators";
import { timingSafeEqual } from "node:crypto";
import type { Knex } from "knex";
import { createPlatformWorkspace, listPlatformWorkspaces, removePlatformWorkspace, updatePlatformWorkspace, updatePlatformWorkspaceAccess } from "../owner/workspaces";

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
  router.get("/public/workspaces", async (_req, res, next) => {
    try { res.json(await listPlatformWorkspaces(masterDatabase, true)); } catch (error) { next(error); }
  });
  router.get("/workspaces", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    try { res.json(await listPlatformWorkspaces(masterDatabase)); } catch (error) { next(error); }
  });
  router.post("/workspaces", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const body = WorkspaceMetadataBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; }
    try { const workspace = await createPlatformWorkspace(masterDatabase, body.data); await recordPlatformAudit(masterDatabase, { eventType: "owner.workspace.created", actorUsername: req.ownerUsername as string, details: { workspaceKey: workspace.workspaceKey } }); res.status(201).json(workspace); } catch (error) { next(error); }
  });
  router.patch("/workspaces/:workspaceKey", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const params = OwnerWorkspaceParams.safeParse(req.params); const body = WorkspaceMetadataBody.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; }
    try { const workspace = await updatePlatformWorkspace(masterDatabase, params.data.workspaceKey, body.data); if (!workspace) { res.status(404).json({ error: "workspace_not_found" }); return; } await recordPlatformAudit(masterDatabase, { eventType: "owner.workspace.updated", actorUsername: req.ownerUsername as string, details: { workspaceKey: workspace.workspaceKey } }); res.json(workspace); } catch (error) { next(error); }
  });
  router.delete("/workspaces/:workspaceKey", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const params = OwnerWorkspaceParams.safeParse(req.params);
    if (!params.success) { res.status(404).json({ error: "workspace_not_found" }); return; }
    try { if (!(await removePlatformWorkspace(masterDatabase, params.data.workspaceKey))) { res.status(404).json({ error: "workspace_not_found" }); return; } await recordPlatformAudit(masterDatabase, { eventType: "owner.workspace.removed", actorUsername: req.ownerUsername as string, details: { workspaceKey: params.data.workspaceKey } }); res.json({ status: "workspace_removed", workspaceKey: params.data.workspaceKey }); } catch (error) { next(error); }
  });
  router.put("/workspaces/:workspaceKey/access", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const params = OwnerWorkspaceParams.safeParse(req.params); const body = WorkspaceAccessBody.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "invalid_workspace_access_payload" }); return; }
    try { const workspace = await updatePlatformWorkspaceAccess(masterDatabase, params.data.workspaceKey, body.data.controls); if (!workspace) { res.status(404).json({ error: "workspace_not_found" }); return; } await recordPlatformAudit(masterDatabase, { eventType: "owner.workspace.access_updated", actorUsername: req.ownerUsername as string, details: { workspaceKey: params.data.workspaceKey, controls: body.data.controls } }); res.json(workspace); } catch (error) { next(error); }
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

  router.get("/tenants/:tenantId/administrators", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const parsedParams = OwnerTenantIdParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "invalid_tenant_administrator_params" });
      return;
    }

    try {
      res.json(
        await listTenantAdministrators(
          masterDatabase,
          parsedParams.data.tenantId,
        ),
      );
    } catch (error) {
      if (error instanceof TenantAdministratorError) {
        res.status(error.code === "tenant_not_found" ? 404 : 503).json({
          error: error.code,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  });

  router.post("/tenants/:tenantId/administrators", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const parsedParams = OwnerTenantIdParams.safeParse(req.params);
    const parsedBody = OwnerTenantAdministratorCreateBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "invalid_tenant_administrator_create_payload" });
      return;
    }

    try {
      res.status(201).json(
        await createTenantAdministrator(
          masterDatabase,
          req.ownerUsername as string,
          parsedParams.data.tenantId,
          parsedBody.data,
        ),
      );
    } catch (error) {
      if (error instanceof TenantAdministratorError) {
        const status =
          error.code === "tenant_not_found"
            ? 404
            : error.code === "administrator_conflict"
              ? 409
              : 503;
        res.status(status).json({ error: error.code, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.patch(
    "/tenants/:tenantId/administrators/:administratorId",
    async (req, res, next) => {
      if (!requireOwnerSession(req, res)) return;
      const parsedParams = OwnerTenantAdministratorParams.safeParse(req.params);
      const parsedBody = OwnerToggleBody.safeParse(req.body);
      if (!parsedParams.success || !parsedBody.success) {
        res.status(400).json({ error: "invalid_tenant_administrator_status_payload" });
        return;
      }

      try {
        res.json(
          await updateTenantAdministratorStatus(
            masterDatabase,
            req.ownerUsername as string,
            parsedParams.data.tenantId,
            parsedParams.data.administratorId,
            parsedBody.data.active,
          ),
        );
      } catch (error) {
        if (error instanceof TenantAdministratorError) {
          res.status(
            error.code === "tenant_not_found" || error.code === "administrator_not_found"
              ? 404
              : 503,
          ).json({ error: error.code, message: error.message });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/tenants/:tenantId/administrators/reset-password",
    async (req, res, next) => {
      if (!requireOwnerSession(req, res)) return;
      const parsedParams = OwnerTenantIdParams.safeParse(req.params);
      const parsedBody = OwnerTenantAdministratorResetBody.safeParse(req.body);
      if (!parsedParams.success || !parsedBody.success) {
        res.status(400).json({ error: "invalid_tenant_administrator_reset_payload" });
        return;
      }

      try {
        res.json(
          await resetTenantAdministratorCredentials(
            masterDatabase,
            req.ownerUsername as string,
            parsedParams.data.tenantId,
            parsedBody.data.currentUsername,
            parsedBody.data.newUsername,
            parsedBody.data.temporaryPassword,
          ),
        );
      } catch (error) {
        if (error instanceof TenantAdministratorError) {
          const status =
            error.code === "tenant_not_found" ||
            error.code === "administrator_not_found"
              ? 404
              : error.code === "administrator_conflict"
                ? 409
                : 503;
          res.status(status).json({
            error: error.code,
            message: error.message,
          });
          return;
        }
        next(error);
      }
    },
  );

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

  router.patch("/tenants/:tenantId", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const parsedParams = OwnerTenantIdParams.safeParse(req.params);
    const parsedBody = OwnerToggleBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "invalid_tenant_status_payload" });
      return;
    }

    try {
      res.json(
        await updateTenantStatus(
          masterDatabase,
          req.ownerUsername as string,
          parsedParams.data.tenantId,
          parsedBody.data.active,
        ),
      );
    } catch (error) {
      if (error instanceof OwnerControlPlaneError) {
        res.status(error.code === "tenant_not_found" ? 404 : 409).json({
          error: error.code,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  });

  router.patch("/tenants/:tenantId/modules/:moduleKey", async (req, res, next) => {
    if (!requireOwnerSession(req, res)) return;
    const parsedParams = OwnerTenantModuleParams.safeParse(req.params);
    const parsedBody = OwnerToggleBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "invalid_tenant_module_payload" });
      return;
    }

    try {
      res.json(
        await updateTenantModule(
          masterDatabase,
          req.ownerUsername as string,
          parsedParams.data.tenantId,
          parsedParams.data.moduleKey,
          parsedBody.data.active,
        ),
      );
    } catch (error) {
      if (error instanceof OwnerControlPlaneError) {
        res.status(error.code === "tenant_not_found" ? 404 : 409).json({
          error: error.code,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  });

  return router;
}

export default ownerRouter;
