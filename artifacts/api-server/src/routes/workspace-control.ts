import { Router, type IRouter, type Response } from "express";
import {
  ModuleWorkspaceAccessBody,
  ModuleWorkspaceCreateBody,
  ModuleWorkspaceControlQuery,
  ModuleWorkspaceHierarchyCreateBody,
  ModuleWorkspaceHierarchyParams,
  ModuleWorkspaceHierarchyUpdateBody,
  ModuleWorkspaceParams,
  WorkspaceMetadataBody,
} from "./schemas";
import {
  createModuleWorkspace,
  addModuleWorkspaceHierarchyNode,
  listModuleWorkspaces,
  removeModuleWorkspace,
  removeModuleWorkspaceHierarchyNode,
  updateModuleWorkspaceHierarchyNode,
  updateWorkspaceContentAccess,
  updateModuleWorkspaceMetadata,
} from "../tenant-administration/workspaces";
import { TenantAdministrationError } from "../tenant-administration/accounts";

const router: IRouter = Router();

function requireWorkspaceControlContext(
  req: Express.Request,
  res: Response,
): boolean {
  if (!req.authenticatedUser) {
    res.status(401).json({ error: "authentication_required" });
    return false;
  }
  if (req.authenticatedUser.requiresPasswordChange) {
    res.status(428).json({ error: "password_change_required" });
    return false;
  }
  if (!req.tenantDatabase || !req.tenantContext) {
    res.status(500).json({ error: "tenant_context_unavailable" });
    return false;
  }
  return true;
}

function statusFor(error: TenantAdministrationError): number {
  if (error.code === "administration_forbidden") return 403;
  if (error.code === "managed_account_not_found") return 404;
  if (error.code === "managed_account_conflict") return 409;
  return 400;
}

function sendAdministrationError(
  error: unknown,
  res: Response,
): error is TenantAdministrationError {
  if (!(error instanceof TenantAdministrationError)) return false;
  res.status(statusFor(error)).json({ error: error.code, message: error.message });
  return true;
}

router.get("/admin/workspaces", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const query = ModuleWorkspaceControlQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "invalid_module_selection" });
    return;
  }
  try {
    res.json(
      await listModuleWorkspaces(
        req.tenantDatabase!,
        req.authenticatedUser!,
        req.tenantContext!.enabledModules,
        query.data.moduleKey,
      ),
    );
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.post("/admin/workspaces/hierarchy", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const body = ModuleWorkspaceHierarchyCreateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_workspace_hierarchy_payload" });
    return;
  }
  try {
    res.status(201).json(await addModuleWorkspaceHierarchyNode(
      req.tenantDatabase!,
      req.authenticatedUser!,
      body.data,
      req.tenantContext!.enabledModules,
    ));
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.patch("/admin/workspaces/hierarchy/:nodeType/:nodeKey", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const params = ModuleWorkspaceHierarchyParams.safeParse(req.params);
  const body = ModuleWorkspaceHierarchyUpdateBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "invalid_workspace_hierarchy_payload" });
    return;
  }
  try {
    res.json(await updateModuleWorkspaceHierarchyNode(
      req.tenantDatabase!,
      req.authenticatedUser!,
      params.data.nodeType,
      params.data.nodeKey,
      body.data,
      req.tenantContext!.enabledModules,
    ));
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.delete("/admin/workspaces/hierarchy/:nodeType/:nodeKey", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const params = ModuleWorkspaceHierarchyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_workspace_hierarchy_target" });
    return;
  }
  try {
    res.json(await removeModuleWorkspaceHierarchyNode(
      req.tenantDatabase!,
      req.authenticatedUser!,
      params.data.nodeType,
      params.data.nodeKey,
      req.tenantContext!.enabledModules,
    ));
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.post("/admin/workspaces", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const body = ModuleWorkspaceCreateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_workspace_payload" });
    return;
  }
  try {
    res.status(201).json(
      await createModuleWorkspace(
        req.tenantDatabase!,
        req.authenticatedUser!,
        body.data.displayName,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.delete("/admin/workspaces/:workspaceKey", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const params = ModuleWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "workspace_not_found" });
    return;
  }
  try {
    res.json(
      await removeModuleWorkspace(
        req.tenantDatabase!,
        req.authenticatedUser!,
        params.data.workspaceKey,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.put("/admin/workspaces/:workspaceKey/access", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const params = ModuleWorkspaceParams.safeParse(req.params);
  const body = ModuleWorkspaceAccessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "invalid_workspace_access_payload" });
    return;
  }
  try {
    res.json(
      await updateWorkspaceContentAccess(
        req.tenantDatabase!,
        req.authenticatedUser!,
        params.data.workspaceKey,
        body.data.controls,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (!sendAdministrationError(error, res)) next(error);
  }
});

router.patch("/admin/workspaces/:workspaceKey/metadata", async (req, res, next) => {
  if (!requireWorkspaceControlContext(req, res)) return;
  const params = ModuleWorkspaceParams.safeParse(req.params);
  const body = WorkspaceMetadataBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; }
  try {
    res.json(await updateModuleWorkspaceMetadata(req.tenantDatabase!, req.authenticatedUser!, params.data.workspaceKey, body.data, req.tenantContext!.enabledModules));
  } catch (error) { if (!sendAdministrationError(error, res)) next(error); }
});

export default router;