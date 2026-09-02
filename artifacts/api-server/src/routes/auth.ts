import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import {
  LoginBody,
  LoginResponse,
  GetCurrentUserResponse,
  LogoutResponse,
  ChangePasswordBody,
  ChangePasswordResponse,
} from "./schemas";
import {
  loadAccountAssignments,
  toLocalAccountRole,
} from "../auth/roles";
import { hashPassword, verifyPassword } from "../auth/password";
import {
  clearSessionCookie,
  serializeSessionCookie,
} from "../auth/local-auth-middleware";
import {
  createSessionToken,
  getSessionSecret,
} from "../auth/session";
import { recordPlatformAudit } from "../owner/control-plane";

interface AccountRow {
  id: string;
  password_hash: string;
  account_type: string;
  is_active: boolean;
  must_change_password: boolean;
  username: string;
  module_key: string | null;
}

async function resolveAuditState(
  masterDatabase: Knex,
  auditId: string,
): Promise<"recorded" | "absent" | "unknown"> {
  try {
    return Boolean(
      await masterDatabase("platform_audit_log")
        .select("id")
        .where({ id: auditId })
        .first(),
    )
      ? "recorded"
      : "absent";
  } catch {
    return "unknown";
  }
}

function authRouter(masterDatabase: Knex): IRouter {
  const router: IRouter = Router();

  router.post("/auth/login", async (req, res, next) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_credentials_payload" });
    return;
  }

  if (!req.tenantContext || !req.tenantDatabase) {
    res.status(500).json({ error: "tenant_context_unavailable" });
    return;
  }

  try {
    const account = await req.tenantDatabase<AccountRow>(
      "core_admin.client_accounts",
    )
      .select(
        "id",
        "username",
        "module_key",
        "password_hash",
        "account_type",
        "is_active",
        "must_change_password",
      )
      .where("username", parsed.data.username)
      .first();

    const validAccount =
      account?.is_active &&
      (await verifyPassword(parsed.data.password, account.password_hash));

    if (!validAccount || !account) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const role = toLocalAccountRole(account.account_type);
    if (!role) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const assignments = await loadAccountAssignments(
      req.tenantDatabase,
      account.id,
      account.module_key,
    );
    req.authenticatedUser = {
      accountId: account.id,
      tenantId: req.tenantContext.tenantId,
      username: account.username,
      role,
      moduleKey: role === "tenant_admin" || role === "tenant_admin_staff" ? null : assignments.moduleKey,
      workspaceKeys: role === "tenant_admin_staff" ? assignments.tenantAdminStaffWorkspaceKeys : assignments.workspaceKeys,
      workspaceAssignments: assignments.workspaceAssignments,
      tenantAdminStaffWorkspaceKeys: assignments.tenantAdminStaffWorkspaceKeys,
      requiresPasswordChange: account.must_change_password,
    };

    const token = createSessionToken(
      {
        accountId: account.id,
        tenantId: req.tenantContext.tenantId,
        role,
      },
      getSessionSecret(),
    );
    res.setHeader(
      "Set-Cookie",
      serializeSessionCookie(token, process.env["NODE_ENV"] === "production" || req.secure),
    );
    res.json(
      LoginResponse.parse({
        accountId: account.id,
        tenantId: req.tenantContext.tenantId,
        role,
        username: account.username,
        moduleKey: role === "tenant_admin" || role === "tenant_admin_staff" ? null : assignments.moduleKey,
        workspaceKeys: role === "tenant_admin_staff" ? assignments.tenantAdminStaffWorkspaceKeys : assignments.workspaceKeys,
        requiresPasswordChange: account.must_change_password,
      }),
    );
  } catch (error) {
    next(error);
  }
  });

  router.get("/auth/me", (req, res) => {
  if (!req.authenticatedUser) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  res.json(GetCurrentUserResponse.parse(req.authenticatedUser));
  });

  router.post("/auth/change-password", async (req, res, next) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_password_change_payload" });
    return;
  }

  if (!req.authenticatedUser || !req.tenantDatabase || !req.tenantContext) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }

  try {
    const account = await req.tenantDatabase.transaction(async (transaction) => {
      const currentAccount = await transaction<AccountRow>(
        "core_admin.client_accounts",
      )
        .select(
          "id",
          "username",
          "password_hash",
           "account_type",
           "module_key",
          "is_active",
          "must_change_password",
        )
        .where({ id: req.authenticatedUser?.accountId })
        .forUpdate()
        .first();

      if (
        !currentAccount ||
        !currentAccount.is_active ||
        !(await verifyPassword(
          parsed.data.currentPassword,
          currentAccount.password_hash,
        ))
      ) {
        return null;
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      const updated = await transaction("core_admin.client_accounts")
        .where({
          id: currentAccount.id,
          is_active: true,
          password_hash: currentAccount.password_hash,
        })
        .update({
          password_hash: passwordHash,
          must_change_password: false,
          updated_at: transaction.fn.now(),
        });

      if (updated !== 1) {
        return null;
      }

      return {
        ...currentAccount,
        newPasswordHash: passwordHash,
      };
    });

    if (!account) {
      res.status(401).json({ error: "invalid_current_password" });
      return;
    }

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: "tenant.account.password_changed",
        actorUsername: account.username,
        subdomain: req.tenantContext.subdomain,
        details: { username: account.username },
      });
    } catch {
      const auditState = await resolveAuditState(masterDatabase, auditId);
      if (auditState === "unknown") {
        res.status(503).json({ error: "password_change_reconciliation_required" });
        return;
      }
      if (auditState === "absent") {
        try {
          const restored = await req.tenantDatabase("core_admin.client_accounts")
            .where({
              id: account.id,
              password_hash: account.newPasswordHash,
              must_change_password: false,
            })
            .update({
              password_hash: account.password_hash,
              must_change_password: account.must_change_password,
              updated_at: req.tenantDatabase.fn.now(),
            });
          if (restored !== 1) {
            throw new Error("Password change compensation did not update one row.");
          }
        } catch {
          res.status(503).json({ error: "password_change_reconciliation_required" });
          return;
        }
        res.status(503).json({ error: "password_change_audit_failed" });
        return;
      }
    }

    res.json(
      ChangePasswordResponse.parse({
        status: "password_changed",
        requiresPasswordChange: false,
      }),
    );
  } catch (error) {
    next(error);
  }
  });

  router.post("/auth/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    clearSessionCookie(process.env["NODE_ENV"] === "production" || req.secure),
  );
  res.json(LogoutResponse.parse({ authenticated: false }));
  });

  return router;
}

export default authRouter;