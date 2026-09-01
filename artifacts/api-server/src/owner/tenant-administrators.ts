import type { Knex } from "knex";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth/password";
import { createPostgresClient } from "../db/knex";
import { recordPlatformAudit } from "./control-plane";

interface TenantReference {
  readonly subdomain: string;
  readonly database_name: string;
}

interface AdministratorRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly is_active: boolean;
  readonly created_at: Date | string;
}

interface AdministratorPasswordRow {
  readonly id: string;
  readonly password_hash: string;
}

export interface TenantAdministrator {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface TenantAdministratorsSnapshot {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly administrators: readonly TenantAdministrator[];
}

export interface TenantAdministratorPasswordReset {
  readonly status: "password_reset";
  readonly tenantId: string;
  readonly subdomain: string;
  readonly username: string;
}

export class TenantAdministratorError extends Error {
  public constructor(
    public readonly code:
      | "tenant_not_found"
      | "tenant_database_unavailable"
      | "administrator_not_found"
      | "password_reset_audit_failed"
      | "password_reset_reconciliation_required",
    message: string,
  ) {
    super(message);
    this.name = "TenantAdministratorError";
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
    throw new TenantAdministratorError(
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
    if (error instanceof TenantAdministratorError) {
      throw error;
    }

    throw new TenantAdministratorError(
      "tenant_database_unavailable",
      "The tenant database is unavailable.",
    );
  } finally {
    await tenantDatabase.destroy();
  }
}

export async function listTenantAdministrators(
  masterDatabase: Knex,
  tenantId: string,
): Promise<TenantAdministratorsSnapshot> {
  return withTenantDatabase(masterDatabase, tenantId, async (tenantDatabase, subdomain) => {
    const administrators = await tenantDatabase<AdministratorRow>(
      "core_admin.client_accounts",
    )
      .select("id", "username", "display_name", "is_active", "created_at")
      .where("account_type", "staff")
      .orderBy("username", "asc");

    return {
      tenantId,
      subdomain,
      administrators: administrators.map((administrator) => ({
        id: administrator.id,
        username: administrator.username,
        displayName: administrator.display_name,
        isActive: administrator.is_active,
        createdAt: new Date(administrator.created_at).toISOString(),
      })),
    };
  });
}

export async function resetTenantAdministratorPassword(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  username: string,
  temporaryPassword: string,
): Promise<TenantAdministratorPasswordReset> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const passwordHash = await hashPassword(temporaryPassword);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    const administrator = await tenantDatabase.transaction(async (transaction) => {
      const account = await transaction<AdministratorPasswordRow>(
        "core_admin.client_accounts",
      )
        .select("id", "password_hash")
        .where("username", username)
        .andWhere("account_type", "staff")
        .andWhere("is_active", true)
        .forUpdate()
        .first();

      if (!account) {
        throw new TenantAdministratorError(
          "administrator_not_found",
          "That active staff administrator was not found.",
        );
      }

      const updated = await transaction("core_admin.client_accounts")
        .where("id", account.id)
        .andWhere("account_type", "staff")
        .andWhere("is_active", true)
        .update({
          password_hash: passwordHash,
          updated_at: transaction.fn.now(),
        });
      if (updated !== 1) {
        throw new TenantAdministratorError(
          "administrator_not_found",
          "That active staff administrator was not found.",
        );
      }

      return account;
    });

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: "owner.tenant_administrator.password_reset",
        actorUsername,
        subdomain: tenant.subdomain,
        details: { username },
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
        throw new TenantAdministratorError(
          "password_reset_reconciliation_required",
          "The password reset audit state could not be reconciled safely.",
        );
      }

      if (auditState === "absent") {
        try {
          const restored = await tenantDatabase("core_admin.client_accounts")
            .where("id", administrator.id)
            .andWhere("password_hash", passwordHash)
            .update({
              password_hash: administrator.password_hash,
              updated_at: tenantDatabase.fn.now(),
            });
          if (restored !== 1) {
            throw new Error("Password reset compensation did not update one row.");
          }
        } catch {
          throw new TenantAdministratorError(
            "password_reset_reconciliation_required",
            "The password reset could not be reconciled safely.",
          );
        }

        throw new TenantAdministratorError(
          "password_reset_audit_failed",
          "The password reset could not be recorded and was rolled back.",
        );
      }
    }

    return {
      status: "password_reset",
      tenantId,
      subdomain: tenant.subdomain,
      username,
    };
  } catch (error) {
    if (error instanceof TenantAdministratorError) {
      throw error;
    }

    throw new TenantAdministratorError(
      "tenant_database_unavailable",
      "The tenant database is unavailable.",
    );
  } finally {
    await tenantDatabase.destroy();
  }
}