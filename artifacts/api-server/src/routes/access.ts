import { Router, type IRouter } from "express";
import {
  GetContentAccessParams,
  GetContentAccessResponse,
  GetRouteAccessParams,
  GetRouteAccessResponse,
} from "./schemas";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import { canAccessWorkspace } from "../auth/roles";
import {
  resolveWorkspaceContentAccess,
  workspaceExists,
} from "../tenant-administration/workspaces";

const router: IRouter = Router();

function isAuthenticated(
  user: AuthenticatedLocalUser | undefined,
): user is AuthenticatedLocalUser {
  return Boolean(user?.accountId && user.role);
}

router.get("/access/:moduleKey/:workspaceKey", async (req, res, next) => {
  const parsedParams = GetRouteAccessParams.safeParse(req.params);

  if (!parsedParams.success) {
    res.status(404).json({ error: "route_target_not_found" });
    return;
  }

  if (!isAuthenticated(req.authenticatedUser)) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }

  if (req.authenticatedUser.requiresPasswordChange) {
    res.status(428).json({ error: "password_change_required" });
    return;
  }

  if (!req.tenantContext || !req.tenantDatabase) {
    res.status(500).json({ error: "tenant_context_unavailable" });
    return;
  }

  const { moduleKey, workspaceKey } = parsedParams.data;

  try {
    if (!(await workspaceExists(req.tenantDatabase, moduleKey, workspaceKey))) {
      res.status(404).json({ error: "route_target_not_found" });
      return;
    }
    const allowed = canAccessWorkspace(
      req.authenticatedUser.role,
      req.authenticatedUser.moduleKey,
      req.authenticatedUser.workspaceAssignments,
      req.tenantContext.enabledModules,
      moduleKey,
      workspaceKey,
    );

    if (!allowed) {
      const moduleAssigned = req.tenantContext.enabledModules.includes(moduleKey);
      res.status(403).json({
        error: moduleAssigned ? "workspace_not_assigned" : "module_not_assigned",
      });
      return;
    }

    const response = GetRouteAccessResponse.parse({
      allowed: true,
      tenantId: req.tenantContext.tenantId,
      customerName: req.tenantContext.customerName,
      subdomain: req.tenantContext.subdomain,
      moduleKey,
      workspaceKey,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/access/:moduleKey/:workspaceKey/content/:nodeType/:nodeKey",
  async (req, res, next) => {
    const parsedParams = GetContentAccessParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(404).json({ error: "content_target_not_found" });
      return;
    }
    if (!isAuthenticated(req.authenticatedUser)) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    if (req.authenticatedUser.requiresPasswordChange) {
      res.status(428).json({ error: "password_change_required" });
      return;
    }
    if (!req.tenantContext || !req.tenantDatabase) {
      res.status(500).json({ error: "tenant_context_unavailable" });
      return;
    }

    const { moduleKey, workspaceKey, nodeType, nodeKey } = parsedParams.data;
    try {
      const workspaceAllowed = canAccessWorkspace(
        req.authenticatedUser.role,
        req.authenticatedUser.moduleKey,
        req.authenticatedUser.workspaceAssignments,
        req.tenantContext.enabledModules,
        moduleKey,
        workspaceKey,
      );
      if (!workspaceAllowed) {
        res.status(403).json({ error: "workspace_not_assigned" });
        return;
      }
      const accessLevel = await resolveWorkspaceContentAccess(
        req.tenantDatabase,
        req.authenticatedUser,
        moduleKey,
        workspaceKey,
        nodeType,
        nodeKey,
      );
      if (!accessLevel) {
        res.status(404).json({ error: "content_target_not_found" });
        return;
      }
      if (accessLevel === "not_available") {
        res.status(403).json({ error: "content_not_available" });
        return;
      }
      res.json(
        GetContentAccessResponse.parse({
          allowed: true,
          moduleKey,
          workspaceKey,
          nodeType,
          nodeKey,
          accessLevel,
          canView: true,
          canSign: accessLevel === "active" || accessLevel === "sign_only",
          canEdit: accessLevel === "active",
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

export default router;