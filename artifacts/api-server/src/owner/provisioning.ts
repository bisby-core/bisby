import { Client } from "pg";
import type { Knex } from "knex";
import { hashPassword } from "../auth/password";
import {
  createPostgresClient,
  postgresConnectionConfig,
} from "../db/knex";
import { tenantRuntimeMigrationConfig } from "../db/tenant-runtime-migrations";
import { MODULE_SCHEMA_NAMES, type ModuleSchemaName } from "../modules/module-schemas";
import { recordPlatformAudit } from "./control-plane";

const ADMIN_ACCOUNT_TYPE = "tenant_admin";

export interface ProvisionTenantInput {
  readonly subdomain: string;
  readonly displayName: string;
  readonly databaseName: string;
  readonly adminUsername: string;
  readonly adminPassword: string;
}

export interface ProvisionTenantResult {
  readonly status: "provisioned";
  readonly tenantId: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly adminUsername: string;
  readonly enabledModuleCount: number;
}

export class TenantProvisioningError extends Error {
  public constructor(
    message: string,
    public readonly stage: string,
    public readonly subdomain: string,
  ) {
    super(message);
    this.name = "TenantProvisioningError";
  }
}

interface TenantRow {
  id: string;
}

interface ModuleRow {
  id: string;
  schema_name: ModuleSchemaName;
}

interface DatabaseProvisioningState {
  databaseCreated: boolean;
  cleanupSucceeded: boolean | null;
}

type RegistrationInspection =
  | { readonly kind: "absent" }
  | { readonly kind: "incomplete" }
  | { readonly kind: "unknown" }
  | { readonly kind: "complete"; readonly result: ProvisionTenantResult };

function quoteDatabaseIdentifier(databaseName: string): string {
  if (!/^[a-z_][a-z0-9_$-]{0,62}$/.test(databaseName)) {
    throw new Error("Invalid PostgreSQL database name.");
  }
  return `"${databaseName}"`;
}

function administrativeDatabaseName(environment: NodeJS.ProcessEnv): string {
  const value =
    environment["BISBY_ADMIN_DB_NAME"] ??
    environment["BISBY_MASTER_DB_NAME"] ??
    "postgres";
  if (!/^[A-Za-z_][A-Za-z0-9_$-]*$/.test(value)) {
    throw new Error("BISBY_ADMIN_DB_NAME must be a plain PostgreSQL name.");
  }
  return value;
}

async function withAdministrativeClient<T>(
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const environment = process.env;
  const databaseName = administrativeDatabaseName(environment);
  const client = new Client(
    postgresConnectionConfig(databaseName, environment),
  );
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function databaseExists(databaseName: string): Promise<boolean> {
  return withAdministrativeClient(async (client) => {
    const result = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_database where datname = $1) as exists",
      [databaseName],
    );
    return result.rows[0]?.exists ?? false;
  });
}

async function createPhysicalDatabase(databaseName: string): Promise<void> {
  if (await databaseExists(databaseName)) {
    throw new TenantProvisioningError(
      "That physical database name is already in use.",
      "validate_database",
      "",
    );
  }

  await withAdministrativeClient(async (client) => {
    try {
      await client.query(`create database ${quoteDatabaseIdentifier(databaseName)}`);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "42P04"
      ) {
        throw new Error("That physical database name is already in use.");
      }
      throw error;
    }
  });
}

async function dropPhysicalDatabase(databaseName: string): Promise<void> {
  await withAdministrativeClient(async (client) => {
    await client.query(
      `drop database if exists ${quoteDatabaseIdentifier(databaseName)} with (force)`,
    );
  });
}

async function migrateAndSeedTenant(
  databaseName: string,
  input: ProvisionTenantInput,
): Promise<void> {
  const tenantDatabase = createPostgresClient({ databaseName });
  try {
    await tenantDatabase.migrate.latest(tenantRuntimeMigrationConfig());
    const passwordHash = await hashPassword(input.adminPassword);
    await tenantDatabase.transaction(async (transaction) => {
      await transaction("core_admin.client_accounts").insert({
        username: input.adminUsername,
        display_name: input.displayName,
        password_hash: passwordHash,
        account_type: ADMIN_ACCOUNT_TYPE,
        module_key: null,
        is_active: true,
         must_change_password: true,
      });

      const account = await transaction("core_admin.client_accounts")
        .select("id")
        .where({ username: input.adminUsername })
        .first<{ id: string }>();
      if (!account) {
        throw new Error("The initial administrator account could not be created.");
      }

    });
  } finally {
    await tenantDatabase.destroy();
  }
}

function stageMessage(stage: string): string {
  const messages: Record<string, string> = {
    validate: "The tenant details could not be validated.",
    validate_database: "The physical database name is unavailable.",
    create_database: "The dedicated tenant database could not be created.",
    migrate_tenant: "The tenant database schema could not be initialized.",
    register: "The tenant could not be registered in the master database.",
  };
  return messages[stage] ?? "Tenant provisioning could not be completed.";
}

async function inspectCommittedRegistration(
  masterDatabase: Knex,
  input: ProvisionTenantInput,
): Promise<RegistrationInspection> {
  try {
    const tenant = await masterDatabase("tenants")
      .select("id", "subdomain", "display_name", "database_name", "is_active")
      .where({ subdomain: input.subdomain })
      .first<{
        id: string;
        subdomain: string;
        display_name: string;
        database_name: string;
        is_active: boolean;
      }>();

    if (!tenant) return { kind: "absent" };
    if (
      tenant.database_name !== input.databaseName ||
      tenant.display_name !== input.displayName ||
      !tenant.is_active
    ) {
      return { kind: "incomplete" };
    }

    const countRow = await masterDatabase("tenant_module_activations")
      .where({ tenant_id: tenant.id, is_enabled: true })
      .countDistinct<{ count: string | number }>({ count: "module_id" })
      .first();
    const enabledModuleCount = Number(countRow?.count ?? 0);
    if (enabledModuleCount !== MODULE_SCHEMA_NAMES.length) {
      return { kind: "incomplete" };
    }

    return {
      kind: "complete",
      result: {
        status: "provisioned",
        tenantId: tenant.id,
        subdomain: tenant.subdomain,
        displayName: tenant.display_name,
        adminUsername: input.adminUsername,
        enabledModuleCount,
      },
    };
  } catch {
    return { kind: "unknown" };
  }
}

export async function provisionTenant(
  masterDatabase: Knex,
  actorUsername: string,
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const state: DatabaseProvisioningState = {
    databaseCreated: false,
    cleanupSucceeded: null,
  };
  let stage = "validate";

  try {
    const result = await masterDatabase.transaction(async (transaction) => {
      await transaction.raw(
        "select pg_advisory_xact_lock(hashtextextended(?, 0))",
        [input.subdomain],
      );

      const existingSubdomain = await transaction("tenants")
        .select("id")
        .where({ subdomain: input.subdomain })
        .first<TenantRow>();
      if (existingSubdomain) {
        throw new TenantProvisioningError(
          "That subdomain is already registered.",
          "validate",
          input.subdomain,
        );
      }

      const existingDatabase = await transaction("tenants")
        .select("id")
        .where({ database_name: input.databaseName })
        .first();
      if (existingDatabase) {
        throw new TenantProvisioningError(
          "That physical database name is already registered.",
          "validate_database",
          input.subdomain,
        );
      }

      stage = "create_database";
      try {
        await createPhysicalDatabase(input.databaseName);
      } catch (error) {
        if (error instanceof TenantProvisioningError) {
          throw new TenantProvisioningError(
            error.message,
            error.stage,
            input.subdomain,
          );
        }
        throw error;
      }
      state.databaseCreated = true;

      stage = "migrate_tenant";
      await migrateAndSeedTenant(input.databaseName, input);

      stage = "register";
      const [tenant] = await transaction("tenants")
        .insert({
          subdomain: input.subdomain,
          display_name: input.displayName,
          database_name: input.databaseName,
          is_active: true,
          updated_at: transaction.fn.now(),
        })
        .returning(["id", "subdomain", "display_name"]);
      if (!tenant) {
        throw new Error("The new tenant could not be registered.");
      }
      const modules = await transaction<ModuleRow>("global_module_registry")
        .select("id", "schema_name")
        .whereIn("schema_name", [...MODULE_SCHEMA_NAMES]);
      if (modules.length !== MODULE_SCHEMA_NAMES.length) {
        throw new Error("The global module registry is incomplete.");
      }

      await transaction("tenant_module_activations").insert(
        modules.map((module) => ({
          tenant_id: tenant.id,
          module_id: module.id,
          is_enabled: true,
          activated_at: transaction.fn.now(),
        })),
      );

      await recordPlatformAudit(transaction, {
        eventType: "owner.tenant.provisioned",
        actorUsername,
        subdomain: input.subdomain,
        details: {
          tenantId: tenant.id,
          enabledModuleCount: modules.length,
          adminUsername: input.adminUsername,
        },
      });

      return {
        status: "provisioned" as const,
        tenantId: tenant.id,
        subdomain: tenant.subdomain,
        displayName: tenant.display_name,
        adminUsername: input.adminUsername,
        enabledModuleCount: modules.length,
      };
    });

    return result;
  } catch (error) {
    let registrationInspection: RegistrationInspection = { kind: "absent" };
    if (state.databaseCreated) {
      registrationInspection = await inspectCommittedRegistration(
        masterDatabase,
        input,
      );
      if (registrationInspection.kind === "complete") {
        return registrationInspection.result;
      }
      if (registrationInspection.kind === "absent") {
        try {
          await dropPhysicalDatabase(input.databaseName);
          state.cleanupSucceeded = true;
        } catch {
          state.cleanupSucceeded = false;
        }
      }
    }

    const provisioningError =
      error instanceof TenantProvisioningError
        ? error
        : new TenantProvisioningError(
            stageMessage(stage),
            stage,
            input.subdomain,
          );

    try {
      await recordPlatformAudit(masterDatabase, {
        eventType: "owner.tenant.provisioning_failed",
        actorUsername,
        subdomain: input.subdomain,
        details: {
          stage: provisioningError.stage,
          message: provisioningError.message,
          cleanedUpDatabase: state.cleanupSucceeded,
          reconciliationRequired:
            registrationInspection.kind === "incomplete" ||
            registrationInspection.kind === "unknown",
        },
      });
    } catch {
      // Preserve the safe provisioning error if the master database is unavailable.
    }

    if (
      registrationInspection.kind === "incomplete" ||
      registrationInspection.kind === "unknown"
    ) {
      throw new TenantProvisioningError(
        "Tenant provisioning has an uncertain registry state and requires manual reconciliation.",
        provisioningError.stage,
        input.subdomain,
      );
    }
    if (state.cleanupSucceeded === false) {
      throw new TenantProvisioningError(
        "Tenant provisioning failed and its physical database requires manual cleanup.",
        provisioningError.stage,
        input.subdomain,
      );
    }
    throw provisioningError;
  }
}