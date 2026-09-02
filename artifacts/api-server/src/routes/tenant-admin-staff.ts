import { Router, type IRouter, type Request, type Response } from "express";
import { TenantAdministrationError } from "../tenant-administration/accounts";
import {
  createTenantAdminStaff,
  deleteTenantAdminStaff,
  createTenantAdminStaffWorkspace,
  addTenantAdminStaffWorkspaceHierarchyNode,
  listTenantAdminStaffSnapshot,
  removeTenantAdminStaffWorkspace,
  removeTenantAdminStaffWorkspaceHierarchyNode,
  resetTenantAdminStaffPassword,
  tenantAdminStaffRouteAccess,
  updateTenantAdminStaffAssignments,
  updateTenantAdminStaffStatus,
  updateTenantAdminStaffWorkspace,
  updateTenantAdminStaffWorkspaceAccess,
  updateTenantAdminStaffWorkspaceHierarchyNode,
} from "../tenant-administration/tenant-admin-staff";
import {
  TenantAdminStaffAccessBody,
  TenantAdminStaffCreateBody,
  TenantAdminStaffRouteAccessParams,
  TenantAdminStaffWorkspaceCreateBody,
  TenantAdminStaffWorkspaceParams,
  TenantAdminStaffWorkspaceUpdateBody,
  TenantAdminUserParams,
  TenantAdminUserResetBody,
  TenantAdminUserStatusBody,
  ModuleWorkspaceAccessBody,
  ModuleWorkspaceHierarchyCreateBody,
  ModuleWorkspaceHierarchyParams,
  ModuleWorkspaceHierarchyUpdateBody,
} from "./schemas";

const router: IRouter = Router();
const context = (req: Request, res: Response) => {
  if (!req.authenticatedUser) { res.status(401).json({ error: "authentication_required" }); return false; }
  if (req.authenticatedUser.requiresPasswordChange) { res.status(428).json({ error: "password_change_required" }); return false; }
  if (!req.tenantDatabase || !req.tenantContext) { res.status(500).json({ error: "tenant_context_unavailable" }); return false; }
  return true;
};
const fail = (error: unknown, res: Response) => {
  if (!(error instanceof TenantAdministrationError)) return false;
  res.status(error.code === "administration_forbidden" ? 403 : error.code === "managed_account_not_found" ? 404 : error.code === "managed_account_conflict" ? 409 : 400).json({ error: error.code, message: error.message }); return true;
};
router.get("/admin/tenant-admin-staff", async (req, res, next) => { if (!context(req, res)) return; try { res.json(await listTenantAdminStaffSnapshot(req.tenantDatabase!, req.authenticatedUser!)); } catch (e) { if (!fail(e, res)) next(e); } });
router.post("/admin/tenant-admin-staff", async (req, res, next) => { if (!context(req, res)) return; const body = TenantAdminStaffCreateBody.safeParse(req.body); if (!body.success) { res.status(400).json({ error: "invalid_tenant_admin_staff_payload" }); return; } try { res.status(201).json(await createTenantAdminStaff(req.tenantDatabase!, req.authenticatedUser!, body.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.patch("/admin/tenant-admin-staff/:accountId", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminUserParams.safeParse(req.params); const b = TenantAdminUserStatusBody.safeParse(req.body); if (!p.success || !b.success) { res.status(400).json({ error: "invalid_tenant_admin_staff_payload" }); return; } try { res.json(await updateTenantAdminStaffStatus(req.tenantDatabase!, req.authenticatedUser!, p.data.accountId, b.data.active)); } catch (e) { if (!fail(e, res)) next(e); } });
router.delete("/admin/tenant-admin-staff/:accountId", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminUserParams.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "invalid_tenant_admin_staff_target" }); return; } try { res.json(await deleteTenantAdminStaff(req.tenantDatabase!, req.authenticatedUser!, p.data.accountId)); } catch (e) { if (!fail(e, res)) next(e); } });
router.put("/admin/tenant-admin-staff/:accountId/assignments", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminUserParams.safeParse(req.params); const b = TenantAdminStaffAccessBody.safeParse(req.body); if (!p.success || !b.success) { res.status(400).json({ error: "invalid_tenant_admin_staff_assignment_payload" }); return; } try { res.json(await updateTenantAdminStaffAssignments(req.tenantDatabase!, req.authenticatedUser!, p.data.accountId, b.data.workspaceKeys)); } catch (e) { if (!fail(e, res)) next(e); } });
router.post("/admin/tenant-admin-staff/:accountId/reset-password", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminUserParams.safeParse(req.params); const b = TenantAdminUserResetBody.safeParse(req.body); if (!p.success || !b.success) { res.status(400).json({ error: "invalid_tenant_admin_staff_reset_payload" }); return; } try { res.json(await resetTenantAdminStaffPassword(req.tenantDatabase!, req.authenticatedUser!, p.data.accountId, b.data.temporaryPassword)); } catch (e) { if (!fail(e, res)) next(e); } });
router.post("/admin/tenant-admin-staff-workspaces", async (req, res, next) => { if (!context(req, res)) return; const b = TenantAdminStaffWorkspaceCreateBody.safeParse(req.body); if (!b.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; } try { res.status(201).json(await createTenantAdminStaffWorkspace(req.tenantDatabase!, req.authenticatedUser!, b.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.post("/admin/tenant-admin-staff-workspaces/hierarchy", async (req, res, next) => { if (!context(req, res)) return; const b = ModuleWorkspaceHierarchyCreateBody.safeParse(req.body); if (!b.success) { res.status(400).json({ error: "invalid_workspace_hierarchy_payload" }); return; } try { res.status(201).json(await addTenantAdminStaffWorkspaceHierarchyNode(req.tenantDatabase!, req.authenticatedUser!, b.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.patch("/admin/tenant-admin-staff-workspaces/hierarchy/:nodeType/:nodeKey", async (req, res, next) => { if (!context(req, res)) return; const p = ModuleWorkspaceHierarchyParams.safeParse(req.params); const b = ModuleWorkspaceHierarchyUpdateBody.safeParse(req.body); if (!p.success || !b.success) { res.status(400).json({ error: "invalid_workspace_hierarchy_payload" }); return; } try { res.json(await updateTenantAdminStaffWorkspaceHierarchyNode(req.tenantDatabase!, req.authenticatedUser!, p.data.nodeType, p.data.nodeKey, b.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.delete("/admin/tenant-admin-staff-workspaces/hierarchy/:nodeType/:nodeKey", async (req, res, next) => { if (!context(req, res)) return; const p = ModuleWorkspaceHierarchyParams.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "invalid_workspace_hierarchy_target" }); return; } try { res.json(await removeTenantAdminStaffWorkspaceHierarchyNode(req.tenantDatabase!, req.authenticatedUser!, p.data.nodeType, p.data.nodeKey)); } catch (e) { if (!fail(e, res)) next(e); } });
router.patch("/admin/tenant-admin-staff-workspaces/:workspaceKey", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminStaffWorkspaceParams.safeParse(req.params); const b = TenantAdminStaffWorkspaceUpdateBody.safeParse(req.body); if (!p.success || !b.success) { res.status(400).json({ error: "invalid_workspace_payload" }); return; } try { res.json(await updateTenantAdminStaffWorkspace(req.tenantDatabase!, req.authenticatedUser!, p.data.workspaceKey, b.data)); } catch (e) { if (!fail(e, res)) next(e); } });
router.put("/admin/tenant-admin-staff-workspaces/:workspaceKey/access", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminStaffWorkspaceParams.safeParse(req.params); const b = ModuleWorkspaceAccessBody.safeParse(req.body); if (!p.success || !b.success) { res.status(400).json({ error: "invalid_workspace_access_payload" }); return; } try { res.json(await updateTenantAdminStaffWorkspaceAccess(req.tenantDatabase!, req.authenticatedUser!, p.data.workspaceKey, b.data.controls)); } catch (e) { if (!fail(e, res)) next(e); } });
router.delete("/admin/tenant-admin-staff-workspaces/:workspaceKey", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminStaffWorkspaceParams.safeParse(req.params); if (!p.success) { res.status(404).json({ error: "workspace_not_found" }); return; } try { res.json(await removeTenantAdminStaffWorkspace(req.tenantDatabase!, req.authenticatedUser!, p.data.workspaceKey)); } catch (e) { if (!fail(e, res)) next(e); } });
router.get("/tenant-admin-staff/:workspaceKey/access", async (req, res, next) => { if (!context(req, res)) return; const p = TenantAdminStaffRouteAccessParams.safeParse(req.params); if (!p.success) { res.status(404).json({ error: "route_target_not_found" }); return; } try { if (!await tenantAdminStaffRouteAccess(req.tenantDatabase!, req.authenticatedUser!, p.data.workspaceKey)) { res.status(403).json({ error: "workspace_not_assigned" }); return; } res.json({ allowed: true, workspaceKey: p.data.workspaceKey, workspaceKeys: req.authenticatedUser!.tenantAdminStaffWorkspaceKeys ?? [] }); } catch (e) { next(e); } });
export default router;