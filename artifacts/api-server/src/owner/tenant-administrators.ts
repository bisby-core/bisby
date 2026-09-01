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

interface AdministratorRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly is_active: boolean;
  readonly created_at: Date | string;
  readonly must_change_password: boolean;
}

interface AdministratorPasswordRow {
  readonly id: string;
  readonly password_hash: string;
  readonly must_change_password: boolean;
}

export interface TenantAdministrator {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly requiresPasswordChange: boolean;
}

export interface TenantAdministratorsSnapshot {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly administrators: readonly TenantAdministrator[];
}

export interface TenantAdministratorCredentialsReset {
  readonly status: "credentials_reset";
  readonly tenantId: string;
  readonly subdomain: string;
  readonly username: string;
  readonly previousUsername: string;
}

export interface TenantAdministratorCreateInput {
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
}

export interface TenantAdministratorCreateResult {
  readonly status: "administrator_created";
  readonly tenantId: string;
  readonly subdomain: string;
  readonly administrator: TenantAdministrator;
}

export class TenantAdministratorError extends Error {
  public constructor(
    public readonly code:
      | "tenant_not_found"
      | "tenant_database_unavailable"
      | "administrator_not_found"
      | "administrator_conflict"
      | "administrator_create_audit_failed"
      | "administrator_create_reconciliation_required"
      | "administrator_deactivate_audit_failed"
      | "administrator_deactivate_reconciliation_required"
      | "credentials_reset_audit_failed"
      | "credentials_reset_reconciliation_required",
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
      .select("must_change_password")
      .where("account_type", ADMIN_ACCOUNT_TYPE)
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
        requiresPasswordChange: administrator.must_change_password,
      })),
    };
  });
}

export async function resetTenantAdministratorCredentials(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  currentUsername: string,
  newUsername: string,
  temporaryPassword: string,
): Promise<TenantAdministratorCredentialsReset> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const passwordHash = await hashPassword(temporaryPassword);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    let administrator: AdministratorPasswordRow;
    try {
      administrator = await tenantDatabase.transaction(async (transaction) => {
        const account = await transaction<AdministratorPasswordRow>(
          "core_admin.client_accounts",
        )
          .select("id", "password_hash", "must_change_password")
          .where("username", currentUsername)
          .andWhere("account_type", ADMIN_ACCOUNT_TYPE)
          .andWhere("is_active", true)
          .forUpdate()
          .first();

        if (!account) {
          throw new TenantAdministratorError(
            "administrator_not_found",
            "That active tenant administrator was not found.",
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
          throw new TenantAdministratorError(
            "administrator_not_found",
            "That active tenant administrator was not found.",
          );
        }

        return account;
      });
    } catch (error) {
      if (
        error instanceof TenantAdministratorError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505")
      ) {
        if (
          error instanceof TenantAdministratorError &&
          error.code === "administrator_not_found"
        ) {
          throw error;
        }
        throw new TenantAdministratorError(
          "administrator_conflict",
          "That administrator username is already in use.",
        );
      }
      throw error;
    }

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: "owner.tenant_administrator.credentials_reset",
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
        throw new TenantAdministratorError(
          "credentials_reset_reconciliation_required",
          "The administrator credential reset audit state could not be reconciled safely.",
        );
      }

      if (auditState === "absent") {
        try {
          const restored = await tenantDatabase("core_admin.client_accounts")
            .where("id", administrator.id)
            .andWhere("username", newUsername)
            .andWhere("password_hash", passwordHash)
            .andWhere("must_change_password", true)
            .update({
              username: currentUsername,
              password_hash: administrator.password_hash,
              must_change_password: administrator.must_change_password,
              updated_at: tenantDatabase.fn.now(),
            });
          if (restored !== 1) {
            throw new Error("Password reset compensation did not update one row.");
          }
        } catch {
          throw new TenantAdministratorError(
            "credentials_reset_reconciliation_required",
            "The administrator credential reset could not be reconciled safely.",
          );
        }

        throw new TenantAdministratorError(
          "credentials_reset_audit_failed",
          "The administrator credential reset could not be recorded and was rolled back.",
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

export async function createTenantAdministrator(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  input: TenantAdministratorCreateInput,
): Promise<TenantAdministratorCreateResult> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const passwordHash = await hashPassword(input.temporaryPassword);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    let administrator: TenantAdministrator;
    try {
      administrator = await tenantDatabase.transaction(async (transaction) => {
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
          throw new TenantAdministratorError(
            "administrator_conflict",
            "The administrator could not be created.",
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
        error instanceof TenantAdministratorError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505")
      ) {
        throw new TenantAdministratorError(
          "administrator_conflict",
          "That administrator username is already in use.",
        );
      }
      throw error;
    }

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: "owner.tenant_administrator.created",
        actorUsername,
        subdomain: tenant.subdomain,
        details: { username: administrator.username },
      });
    } catch {
      const auditState = await resolveAuditState(masterDatabase, auditId);
      if (auditState === "unknown") {
        throw new TenantAdministratorError(
          "administrator_create_reconciliation_required",
          "The administrator creation audit state could not be reconciled safely.",
        );
      }
      if (auditState === "absent") {
        try {
          const removed = await tenantDatabase("core_admin.client_accounts")
            .where({ id: administrator.id, username: administrator.username })
            .del();
          if (removed !== 1) {
            throw new Error("Administrator creation compensation did not remove one row.");
          }
        } catch {
          throw new TenantAdministratorError(
            "administrator_create_reconciliation_required",
            "The administrator creation could not be reconciled safely.",
          );
        }
        throw new TenantAdministratorError(
          "administrator_create_audit_failed",
          "The administrator could not be created and was rolled back.",
        );
      }
    }

    return { status: "administrator_created", tenantId, subdomain: tenant.subdomain, administrator };
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

export async function updateTenantAdministratorStatus(
  masterDatabase: Knex,
  actorUsername: string,
  tenantId: string,
  administratorId: string,
  active: boolean,
): Promise<{ status: "administrator_status_updated"; tenantId: string; subdomain: string; administratorId: string; active: boolean }> {
  const tenant = await findTenantReference(masterDatabase, tenantId);
  const tenantDatabase = createPostgresClient({
    databaseName: tenant.database_name,
  });

  try {
    await tenantDatabase.raw("select 1");
    const administrator = await tenantDatabase.transaction(async (transaction) => {
      const account = await transaction<{
        id: string;
        username: string;
        is_active: boolean;
      }>("core_admin.client_accounts")
        .select("id", "username", "is_active")
        .where("id", administratorId)
        .andWhere("account_type", ADMIN_ACCOUNT_TYPE)
        .forUpdate()
        .first();
      if (!account) {
        throw new TenantAdministratorError(
          "administrator_not_found",
          "That tenant administrator was not found.",
        );
      }

      const updated = await transaction("core_admin.client_accounts")
        .where({
          id: administratorId,
          account_type: ADMIN_ACCOUNT_TYPE,
          is_active: account.is_active,
        })
        .update({ is_active: active, updated_at: transaction.fn.now() });
      if (updated !== 1) {
        throw new TenantAdministratorError(
          "administrator_not_found",
          "That tenant administrator was not found.",
        );
      }
      return account;
    });

    const auditId = randomUUID();
    try {
      await recordPlatformAudit(masterDatabase, {
        eventId: auditId,
        eventType: active
          ? "owner.tenant_administrator.activated"
          : "owner.tenant_administrator.deactivated",
        actorUsername,
        subdomain: tenant.subdomain,
        details: { username: administrator.username, active },
      });
    } catch {
      const auditState = await resolveAuditState(masterDatabase, auditId);
      if (auditState === "unknown") {
        throw new TenantAdministratorError(
          "administrator_deactivate_reconciliation_required",
          "The administrator status audit state could not be reconciled safely.",
        );
      }
      if (auditState === "absent") {
        try {
          const restored = await tenantDatabase("core_admin.client_accounts")
            .where({ id: administratorId, is_active: active })
            .update({
              is_active: administrator.is_active,
              updated_at: tenantDatabase.fn.now(),
            });
          if (restored !== 1) {
            throw new Error("Administrator status compensation did not update one row.");
          }
        } catch {
          throw new TenantAdministratorError(
            "administrator_deactivate_reconciliation_required",
            "The administrator status could not be reconciled safely.",
          );
        }
        throw new TenantAdministratorError(
          "administrator_deactivate_audit_failed",
          "The administrator status could not be recorded and was rolled back.",
        );
      }
    }

    return { status: "administrator_status_updated", tenantId, subdomain: tenant.subdomain, administratorId, active };
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
