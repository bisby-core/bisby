import type { Knex } from "knex";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth/password";
import { createPostgresClient } from "../db/knex";
import { recordPlatformAudit } from "./control-plane";
const ADMIN_ACCOUNT_TYPE = "tenant_admin";

interface TenantReference {
  readonly subdomain: string;
  readonly database_name: string;
}

interface TenantAdminRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly is_active: boolean;
  readonly created_at: Date | string;
  readonly must_change_password: boolean;
}

interface TenantAdminPasswordRow {
  readonly id: string;
  readonly password_hash: string;
  readonly must_change_password: boolean;
}

export interface TenantAdmin {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly requiresPasswordChange: boolean;
}

export interface TenantAdminsSnapshot {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly tenantAdmins: readonly TenantAdmin[];
}

export interface TenantAdminCredentialsReset {
  readonly status: "credentials_reset";
  readonly tenantId: string;
  readonly subdomain: string;
  readonly username: string;
  readonly previousUsername: string;
}

export interface TenantAdminCreateInput {
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
}

export interface TenantAdminCreateResult {
  readonly status: "tenant_admin_created";
  readonly tenantId: string;
  readonly subdomain: string;
  readonly tenantAdmin: TenantAdmin;
}

export class TenantAdminError extends Error {
  public constructor(
    public readonly code:
      | "tenant_not_found"
      | "tenant_database_unavailable"
      | "tenant_admin_not_found"
      | "tenant_admin_conflict"
      | "tenant_admin_create_audit_failed"
      | "tenant_admin_create_reconciliation_required"
      | "tenant_admin_deactivate_audit_failed"
      | "tenant_admin_deactivate_reconciliation_required"
      | "credentials_reset_audit_failed"
      | "credentials_reset_reconciliation_required",
    message: string,
  ) {
    super(message);
    this.name = "TenantAdminError";
  }
}

async function findTenantReference(
  masterDatabase: Knex,
  tenantId: string,
): Promise<TenantReference> {
  const tenant = await masterDatabase("tenants")
    .select("subdomain", "database_name")
    .where({ id: tenantId })
    .first<TenantReference>();

  if (!tenant) {
    throw new TenantAdminError(
      "tenant_not_found",
      "That tenant is not registered.",
    );
  }

  return tenant;
}

async function withTenantDatabase<T>(
  masterDatabase: Knex,
  tenantId: string,
  callback: (database: Knex, subdomain: string) => Promise<T>,
): Promise<T> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    return await callback(tenantDatabase, tenant.subdomain);
  } catch (error) {
    if (error instanceof TenantAdminError) {
      throw error;
    }

    throw new TenantAdminError(
      "tenant_database_unavailable",
      "The tenant database is unavailable.",
    );
  } finally {
    await tenantDatabase.destroy();
  }
}

export async function listTenantAdmins(
  masterDatabase: Knex,
  tenantId: string,
): Promise<TenantAdminsSnapshot> {
  return withTenantDatabase(masterDatabase, tenantId, async (tenantDatabase, subdomain) => {
    const tenantAdmins = await tenantDatabase<TenantAdminRow>(
      "core_admin.client_accounts",
    )
      .select("id", "username", "display_name", "is_active", "created_at")
      .select("must_change_password")
      .where("account_type", ADMIN_ACCOUNT_TYPE)
      .orderBy("username", "asc");

    return {
      tenantId,
      subdomain,
      tenantAdmins: tenantAdmins.map((tenantAdmin) => ({
        id: tenantAdmin.id,
        username: tenantAdmin.username,
        displayName: tenantAdmin.display_name,
        isActive: tenantAdmin.is_active,
        createdAt: new Date(tenantAdmin.created_at).toISOString(),
        requiresPasswordChange: tenantAdmin.must_change_password,
      })),
    };
  });
}

export async function resetTenantAdminCredentials(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  currentUsername: string,
  newUsername: string,
  temporaryPassword: string,
): Promise<TenantAdminCredentialsReset> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const passwordHash = await hashPassword(temporaryPassword);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    let tenantAdmin: TenantAdminPasswordRow;
    try {
      tenantAdmin = await tenantDatabase.transaction(async (transaction) => {
        const account = await transaction<TenantAdminPasswordRow>(
          "core_admin.client_accounts",
        )
          .select("id", "password_hash", "must_change_password")
          .where("username", currentUsername)
          .andWhere("account_type", ADMIN_ACCOUNT_TYPE)
          .andWhere("is_active", true)
          .forUpdate()
          .first();

        if (!account) {
          throw new TenantAdminError(
            "tenant_admin_not_found",
            "That active tenant admin was not found.",
          );
        }

        const updated = await transaction("core_admin.client_accounts")
          .where("id", account.id)
          .andWhere("account_type", ADMIN_ACCOUNT_TYPE)
          .andWhere("is_active", true)
          .update({
            username: newUsername,
            password_hash: passwordHash,
            must_change_password: true,
            updated_at: transaction.fn.now(),
          });
        if (updated !== 1) {
          throw new TenantAdminError(
            "tenant_admin_not_found",
            "That active tenant admin was not found.",
          );
        }

        return account;
      });
    } catch (error) {
      if (
        error instanceof TenantAdminError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505")
      ) {
        if (
          error instanceof TenantAdminError &&
          error.code === "tenant_admin_not_found"
        ) {
          throw error;
        }
        throw new TenantAdminError(
          "tenant_admin_conflict",
          "That tenant admin username is already in use.",
        );
      }
      throw error;
    }

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: "owner.tenant_admin.credentials_reset",
        actorUsername,
        subdomain: tenant.subdomain,
        details: { previousUsername: currentUsername, username: newUsername },
      });
    } catch {
      let auditState: "recorded" | "absent" | "unknown" = "unknown";
      try {
        auditState = Boolean(
          await masterDatabase("platform_audit_log")
            .select("id")
            .where({ id: auditId })
            .first(),
        )
          ? "recorded"
          : "absent";
      } catch {
        auditState = "unknown";
      }

      if (auditState === "unknown") {
        throw new TenantAdminError(
          "credentials_reset_reconciliation_required",
          "The tenant admin credential reset audit state could not be reconciled safely.",
        );
      }

      if (auditState === "absent") {
        try {
          const restored = await tenantDatabase("core_admin.client_accounts")
            .where("id", tenantAdmin.id)
            .andWhere("username", newUsername)
            .andWhere("password_hash", passwordHash)
            .andWhere("must_change_password", true)
            .update({
              username: currentUsername,
              password_hash: tenantAdmin.password_hash,
              must_change_password: tenantAdmin.must_change_password,
              updated_at: tenantDatabase.fn.now(),
            });
          if (restored !== 1) {
            throw new Error("Password reset compensation did not update one row.");
          }
        } catch {
          throw new TenantAdminError(
            "credentials_reset_reconciliation_required",
            "The tenant admin credential reset could not be reconciled safely.",
          );
        }

        throw new TenantAdminError(
          "credentials_reset_audit_failed",
          "The tenant admin credential reset could not be recorded and was rolled back.",
        );
      }
    }

    return {
      status: "credentials_reset",
      tenantId,
      subdomain: tenant.subdomain,
      username: newUsername,
      previousUsername: currentUsername,
    };
  } catch (error) {
    if (error instanceof TenantAdminError) {
      throw error;
    }

    throw new TenantAdminError(
      "tenant_database_unavailable",
      "The tenant database is unavailable.",
    );
  } finally {
    await tenantDatabase.destroy();
  }
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

export async function createTenantAdmin(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  input: TenantAdminCreateInput,
): Promise<TenantAdminCreateResult> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const passwordHash = await hashPassword(input.temporaryPassword);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    let tenantAdmin: TenantAdmin;
    try {
      tenantAdmin = await tenantDatabase.transaction(async (transaction) => {
        const [account] = await transaction("core_admin.client_accounts")
          .insert({
            username: input.username,
            display_name: input.displayName,
            password_hash: passwordHash,
            account_type: ADMIN_ACCOUNT_TYPE,
            is_active: true,
            must_change_password: true,
          })
          .returning([
            "id",
            "username",
            "display_name",
            "is_active",
            "created_at",
            "must_change_password",
          ]);

        if (!account) {
          throw new TenantAdminError(
            "tenant_admin_conflict",
            "The tenant admin could not be created.",
          );
        }

        return {
          id: account.id,
          username: account.username,
          displayName: account.display_name,
          isActive: account.is_active,
          createdAt: new Date(account.created_at).toISOString(),
          requiresPasswordChange: account.must_change_password,
        };
      });
    } catch (error) {
      if (
        error instanceof TenantAdminError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505")
      ) {
        throw new TenantAdminError(
          "tenant_admin_conflict",
          "That tenant admin username is already in use.",
        );
      }
      throw error;
    }

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: "owner.tenant_admin.created",
        actorUsername,
        subdomain: tenant.subdomain,
        details: { username: tenantAdmin.username },
      });
    } catch {
      const auditState = await resolveAuditState(masterDatabase, auditId);
      if (auditState === "unknown") {
        throw new TenantAdminError(
          "tenant_admin_create_reconciliation_required",
          "The tenant admin creation audit state could not be reconciled safely.",
        );
      }
      if (auditState === "absent") {
        try {
          const removed = await tenantDatabase("core_admin.client_accounts")
            .where({ id: tenantAdmin.id, username: tenantAdmin.username })
            .del();
          if (removed !== 1) {
            throw new Error("Tenant admin creation compensation did not remove one row.");
          }
        } catch {
          throw new TenantAdminError(
            "tenant_admin_create_reconciliation_required",
            "The tenant admin creation could not be reconciled safely.",
          );
        }
        throw new TenantAdminError(
          "tenant_admin_create_audit_failed",
          "The tenant admin could not be created and was rolled back.",
        );
      }
    }

    return { status: "tenant_admin_created", tenantId, subdomain: tenant.subdomain, tenantAdmin };
  } catch (error) {
    if (error instanceof TenantAdminError) {
      throw error;
    }
    throw new TenantAdminError(
      "tenant_database_unavailable",
      "The tenant database is unavailable.",
    );
  } finally {
    await tenantDatabase.destroy();
  }
}

export async function updateTenantAdminStatus(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  tenantAdminId: string,
  active: boolean,
): Promise<{ status: "tenant_admin_status_updated"; tenantId: string; subdomain: string; tenantAdminId: string; active: boolean }> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    const tenantAdmin = await tenantDatabase.transaction(async (transaction) => {
      const account = await transaction<{
        id: string;
        username: string;
        is_active: boolean;
      }>("core_admin.client_accounts")
        .select("id", "username", "is_active")
        .where("id", tenantAdminId)
        .andWhere("account_type", ADMIN_ACCOUNT_TYPE)
        .forUpdate()
        .first();
      if (!account) {
        throw new TenantAdminError(
          "tenant_admin_not_found",
          "That tenant admin was not found.",
        );
      }

      const updated = await transaction("core_admin.client_accounts")
        .where({
          id: tenantAdminId,
          account_type: ADMIN_ACCOUNT_TYPE,
          is_active: account.is_active,
        })
        .update({ is_active: active, updated_at: transaction.fn.now() });
      if (updated !== 1) {
        throw new TenantAdminError(
          "tenant_admin_not_found",
          "That tenant admin was not found.",
        );
      }
      return account;
    });

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: active
          ? "owner.tenant_admin.activated"
          : "owner.tenant_admin.deactivated",
        actorUsername,
        subdomain: tenant.subdomain,
        details: { username: tenantAdmin.username, active },
      });
    } catch {
      const auditState = await resolveAuditState(masterDatabase, auditId);
      if (auditState === "unknown") {
        throw new TenantAdminError(
          "tenant_admin_deactivate_reconciliation_required",
          "The tenant admin status audit state could not be reconciled safely.",
        );
      }
      if (auditState === "absent") {
        try {
          const restored = await tenantDatabase("core_admin.client_accounts")
            .where({ id: tenantAdminId, is_active: active })
            .update({
              is_active: tenantAdmin.is_active,
              updated_at: tenantDatabase.fn.now(),
            });
          if (restored !== 1) {
            throw new Error("Tenant admin status compensation did not update one row.");
          }
        } catch {
          throw new TenantAdminError(
            "tenant_admin_deactivate_reconciliation_required",
            "The tenant admin status could not be reconciled safely.",
          );
        }
        throw new TenantAdminError(
          "tenant_admin_deactivate_audit_failed",
          "The tenant admin status could not be recorded and was rolled back.",
        );
      }
    }

    return { status: "tenant_admin_status_updated", tenantId, subdomain: tenant.subdomain, tenantAdminId, active };
  } catch (error) {
    if (error instanceof TenantAdminError) {
      throw error;
    }
    throw new TenantAdminError(
      "tenant_database_unavailable",
      "The tenant database is unavailable.",
    );
  } finally {
    await tenantDatabase.destroy();
  }
}
