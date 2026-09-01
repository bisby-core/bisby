import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  TenantAdminUserCreateBody,
  TenantAdminUserAccessBody,
  TenantAdminUserParams,
  TenantAdminUserResetBody,
  TenantAdminUserStatusBody,
} from "./schemas";
import {
  createManagedTenantAccount,
  getTenantAdministrationSnapshot,
  resetManagedTenantAccountPassword,
  TenantAdministrationError,
  updateManagedTenantAccountStatus,
  updateManagedTenantAccountAccess,
} from "../tenant-administration/accounts";

const router: IRouter = Router();

function statusFor(error: TenantAdministrationError): number {
  if (error.code === "administration_forbidden") return 403;
  if (error.code === "managed_account_not_found") return 404;
  if (error.code === "managed_account_conflict") return 409;
  return 400;
}

function requireAdministrationContext(
  req: Request,
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
  if (!req.tenantContext || !req.tenantDatabase) {
    res.status(500).json({ error: "tenant_context_unavailable" });
    return false;
  }
  return true;
}

router.get("/admin/users", async (req, res, next) => {
  if (!requireAdministrationContext(req, res)) return;
  try {
    res.json(
      await getTenantAdministrationSnapshot(
        req.tenantDatabase!,
        req.authenticatedUser!,
        req.tenantContext!.tenantId,
        req.tenantContext!.subdomain,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (error instanceof TenantAdministrationError) {
      res.status(statusFor(error)).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
});

router.post("/admin/users", async (req, res, next) => {
  if (!requireAdministrationContext(req, res)) return;
  const parsed = TenantAdminUserCreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_managed_account_payload" });
    return;
  }
  try {
    res.status(201).json(
      await createManagedTenantAccount(
        req.tenantDatabase!,
        req.authenticatedUser!,
        parsed.data,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (error instanceof TenantAdministrationError) {
      res.status(statusFor(error)).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch("/admin/users/:accountId/access", async (req, res, next) => {
  if (!requireAdministrationContext(req, res)) return;
  const params = TenantAdminUserParams.safeParse(req.params);
  const body = TenantAdminUserAccessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "invalid_managed_account_access_payload" });
    return;
  }
  try {
    res.json(
      await updateManagedTenantAccountAccess(
        req.tenantDatabase!,
        req.authenticatedUser!,
        params.data.accountId,
        body.data,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (error instanceof TenantAdministrationError) {
      res.status(statusFor(error)).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch("/admin/users/:accountId", async (req, res, next) => {
  if (!requireAdministrationContext(req, res)) return;
  const params = TenantAdminUserParams.safeParse(req.params);
  const body = TenantAdminUserStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "invalid_managed_account_status_payload" });
    return;
  }
  try {
    res.json(
      await updateManagedTenantAccountStatus(
        req.tenantDatabase!,
        req.authenticatedUser!,
        params.data.accountId,
        body.data.active,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (error instanceof TenantAdministrationError) {
      res.status(statusFor(error)).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
});

router.post("/admin/users/:accountId/reset-password", async (req, res, next) => {
  if (!requireAdministrationContext(req, res)) return;
  const params = TenantAdminUserParams.safeParse(req.params);
  const body = TenantAdminUserResetBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "invalid_managed_account_reset_payload" });
    return;
  }
  try {
    res.json(
      await resetManagedTenantAccountPassword(
        req.tenantDatabase!,
        req.authenticatedUser!,
        params.data.accountId,
        body.data.temporaryPassword,
        req.tenantContext!.enabledModules,
      ),
    );
  } catch (error) {
    if (error instanceof TenantAdministrationError) {
      res.status(statusFor(error)).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
});

export default router;