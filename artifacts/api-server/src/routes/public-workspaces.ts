import { Router, type IRouter, type Response } from "express";
import { TenantAdministrationError } from "../tenant-administration/accounts";
import { createTenantWorkspace, listPublicTenantWorkspaces, listTenantWorkspaces, removeTenantWorkspace, updateTenantWorkspace, updateTenantWorkspaceAccess } from "../tenant-administration/public-workspaces";
import { TenantWorkspaceParams, WorkspaceAccessBody, WorkspaceMetadataBody } from "./schemas";

const router: IRouter = Router();
function context(req: Express.Request, res: Response): boolean {
  if (!req.authenticatedUser) { res.status(401).json({ error: "authentication_required" }); return false; }
  if (req.authenticatedUser.requiresPasswordChange) { res.status(428).json({ error: "password_change_required" }); return false; }
  // This check deliberately precedes the tenant database assertion.
  if (req.authenticatedUser.role !== "tenant_admin") { res.status(403).json({ error: "administration_forbidden" }); return false; }
  if (!req.tenantDatabase) { res.status(500).json({ error: "tenant_context_unavailable" }); return false; }
  return true;
}
function fail(error: unknown, res: Response): boolean {
  if (!(error instanceof TenantAdministrationError)) return false;
  res.status(error.code === "administration_forbidden" ? 403 : error.code === "managed_account_not_found" ? 404 : 400).json({ error: error.code, message: error.message }); return true;
}
router.get("/admin/tenant-workspaces", async (req, res, next) => { if (!context(req, res)) return; try { res.json(await listTenantWorkspaces(req.tenantDatabase!, req.authenticatedUser!)); } catch (e) { if (!fail(e, res)) next(e); } });
router.post("/admin/tenant-workspaces", async (req, res, next) => { if (!context(req, res)) return; const body = WorkspaceMetadataBody.safeParse(req.body); if (!body.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; } try { res.status(201).json(await createTenantWorkspace(req.tenantDatabase!, req.authenticatedUser!, body.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.patch("/admin/tenant-workspaces/:workspaceKey", async (req, res, next) => { if (!context(req, res)) return; const params = TenantWorkspaceParams.safeParse(req.params); const body = WorkspaceMetadataBody.safeParse(req.body); if (!params.success || !body.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; } try { res.json(await updateTenantWorkspace(req.tenantDatabase!, req.authenticatedUser!, params.data.workspaceKey, body.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.put("/admin/tenant-workspaces/:workspaceKey/access", async (req, res, next) => { if (!context(req, res)) return; const params = TenantWorkspaceParams.safeParse(req.params); const body = WorkspaceAccessBody.safeParse(req.body); if (!params.success || !body.success) { res.status(400).json({ error: "invalid_workspace_access_payload" }); return; } try { res.json(await updateTenantWorkspaceAccess(req.tenantDatabase!, req.authenticatedUser!, params.data.workspaceKey, body.data.controls)); } catch (e) { if (!fail(e, res)) next(e); } });
router.delete("/admin/tenant-workspaces/:workspaceKey", async (req, res, next) => { if (!context(req, res)) return; const params = TenantWorkspaceParams.safeParse(req.params); if (!params.success) { res.status(404).json({ error: "workspace_not_found" }); return; } try { res.json(await removeTenantWorkspace(req.tenantDatabase!, req.authenticatedUser!, params.data.workspaceKey)); } catch (e) { if (!fail(e, res)) next(e); } });
router.get("/public/workspaces", async (req, res, next) => { if (!req.tenantDatabase || !req.tenantContext) { res.status(500).json({ error: "tenant_context_unavailable" }); return; } try { res.json(await listPublicTenantWorkspaces(req.tenantDatabase, req.tenantContext.enabledModules)); } catch (e) { next(e); } });
export default router;