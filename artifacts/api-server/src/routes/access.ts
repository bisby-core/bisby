import { Router, type IRouter } from "express";
import {
  GetRouteAccessParams,
  GetRouteAccessResponse,
} from "./schemas";
import type { AuthenticatedLocalUser } from "../tenancy/express";

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

  if (!req.tenantContext || !req.tenantDatabase) {
    res.status(500).json({ error: "tenant_context_unavailable" });
    return;
  }

  const { moduleKey, workspaceKey } = parsedParams.data;

  if (!req.tenantContext.enabledModules.includes(moduleKey)) {
    res.status(403).json({ error: "module_not_assigned" });
    return;
  }

  try {
    const permission = await req.tenantDatabase("core_admin.tab_permissions")
      .select("id")
      .where({
        client_account_id: req.authenticatedUser.accountId,
        module_schema: moduleKey,
        workspace_key: workspaceKey,
        can_view: true,
      })
      .first();

    if (!permission) {
      res.status(403).json({ error: "workspace_not_assigned" });
      return;
    }

    const response = GetRouteAccessResponse.parse({
      allowed: true,
      tenantId: req.tenantContext.tenantId,
      subdomain: req.tenantContext.subdomain,
      moduleKey,
      workspaceKey,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;