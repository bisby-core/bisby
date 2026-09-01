import type { Knex } from "knex";
import { createMasterDatabase, createPostgresClient } from "./knex";
import { migrationConfig } from "./migration-config";
import { hashPassword } from "../auth/password";
import {
  MODULE_SCHEMA_NAMES,
} from "../modules/module-schemas";

const DEFAULT_ADMIN_PASSWORD = "password123";
const ADMIN_USERNAME = "admin";
const ADMIN_DISPLAY_NAME = "BisBy Administrator";
const PERMISSION_TAB_KEY = "workspace_access";
const WORKSPACE_KEYS = Array.from(
  { length: 10 },
  (_, index) => `ws-${index + 1}`,
);

const INITIAL_TENANTS = [
  {
    subdomain: "design",
    displayName: "Master Design Studio",
    databaseNameEnv: "BISBY_DESIGN_DB_NAME",
  },
  {
    subdomain: "clientalpha",
    displayName: "Client Alpha",
    databaseNameEnv: "BISBY_CLIENTALPHA_DB_NAME",
  },
] as const;

interface ModuleRow {
  id: string;
  module_key: string;
  schema_name: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured before seeding tenants.`);
  }
  return value;
}

function assertDistinctTenantDatabaseNames(
  databaseNames: readonly string[],
): void {
  if (new Set(databaseNames).size !== databaseNames.length) {
    throw new Error(
      "Each BisBy tenant must use a distinct physical PostgreSQL database name.",
    );
  }
}

interface DatabaseIdentity {
  database_name: string;
  server_address: string | null;
  server_port: number | null;
}

async function readDatabaseIdentity(
  database: Knex,
): Promise<DatabaseIdentity> {
  const result = await database.raw(
    "select current_database() as database_name, " +
      "inet_server_addr()::text as server_address, " +
      "inet_server_port() as server_port",
  );
  const rows = (result as unknown as { rows: DatabaseIdentity[] }).rows;
  const identity = rows[0];
  if (!identity) {
    throw new Error("Could not determine a tenant database identity.");
  }
  return identity;
}

function databaseIdentityKey(identity: DatabaseIdentity): string {
  return [
    identity.database_name,
    identity.server_address ?? "local",
    identity.server_port ?? "local",
  ].join(":");
}

async function migrateDatabase(
  database: Knex,
  target: "master" | "tenant",
): Promise<void> {
  await database.migrate.latest(migrationConfig(target));
}

async function seedTenantDatabase(
  database: Knex,
  passwordHash: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction("core_admin.client_accounts")
      .insert({
        username: ADMIN_USERNAME,
        display_name: ADMIN_DISPLAY_NAME,
        password_hash: passwordHash,
        account_type: "tenant_admin",
        module_key: null,
        is_active: true,
      })
      .onConflict("username")
      .merge({
        display_name: ADMIN_DISPLAY_NAME,
        password_hash: passwordHash,
        account_type: "tenant_admin",
        module_key: null,
        is_active: true,
        updated_at: transaction.fn.now(),
      });

    const account = await transaction("core_admin.client_accounts")
      .select("id")
      .where({ username: ADMIN_USERNAME })
      .first<{ id: string }>();

    if (!account) {
      throw new Error("The seeded administrator account could not be loaded.");
    }

    const permissions = MODULE_SCHEMA_NAMES.flatMap((moduleSchema) =>
      WORKSPACE_KEYS.map((workspaceKey) => ({
        client_account_id: account.id,
        module_schema: moduleSchema,
        workspace_key: workspaceKey,
        tab_key: PERMISSION_TAB_KEY,
        can_view: true,
        can_edit: true,
      })),
    );

    await transaction("core_admin.tab_permissions")
      .insert(permissions)
      .onConflict([
        "client_account_id",
        "module_schema",
        "workspace_key",
        "tab_key",
      ])
      .merge({
        can_view: true,
        can_edit: true,
        updated_at: transaction.fn.now(),
      });
  });
}

async function seedMasterDatabase(
  database: Knex,
  tenantDatabaseNames: Readonly<Record<string, string>>,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const modules = await transaction<ModuleRow>("global_module_registry")
      .select("id", "module_key", "schema_name")
      .whereIn("schema_name", [...MODULE_SCHEMA_NAMES]);

    if (modules.length !== MODULE_SCHEMA_NAMES.length) {
      throw new Error(
        "The global module registry must contain all eight BisBy modules before seeding.",
      );
    }

    for (const tenant of INITIAL_TENANTS) {
      await transaction("tenants")
        .insert({
          subdomain: tenant.subdomain,
          display_name: tenant.displayName,
          database_name: tenantDatabaseNames[tenant.subdomain],
          is_active: true,
          updated_at: transaction.fn.now(),
        })
        .onConflict("subdomain")
        .merge({
          display_name: tenant.displayName,
          database_name: tenantDatabaseNames[tenant.subdomain],
          is_active: true,
          updated_at: transaction.fn.now(),
        });

      const tenantRow = await transaction("tenants")
        .select("id")
        .where({ subdomain: tenant.subdomain })
        .first<{ id: string }>();

      if (!tenantRow) {
        throw new Error(`Tenant ${tenant.subdomain} could not be loaded.`);
      }

      await transaction("tenant_module_activations")
        .insert(
          modules.map((module) => ({
            tenant_id: tenantRow.id,
            module_id: module.id,
            is_enabled: true,
            activated_at: transaction.fn.now(),
            deactivated_at: null,
          })),
        )
        .onConflict(["tenant_id", "module_id"])
        .merge({
          is_enabled: true,
          activated_at: transaction.fn.now(),
          deactivated_at: null,
        });
    }
  });
}

async function main(): Promise<void> {
  const tenantDatabaseNames = Object.fromEntries(
    INITIAL_TENANTS.map((tenant) => [
      tenant.subdomain,
      requiredEnvironment(tenant.databaseNameEnv),
    ]),
  );
  assertDistinctTenantDatabaseNames(Object.values(tenantDatabaseNames));

  const configuredPassword = process.env["BISBY_DEFAULT_ADMIN_PASSWORD"];
  if (process.env["NODE_ENV"] === "production" && !configuredPassword) {
    throw new Error(
      "BISBY_DEFAULT_ADMIN_PASSWORD must be explicitly configured for production seeding.",
    );
  }
  const password = configuredPassword ?? DEFAULT_ADMIN_PASSWORD;
  const passwordHash = await hashPassword(password);
  const masterDatabase = createMasterDatabase();
  const tenantDatabases = INITIAL_TENANTS.map((tenant) => ({
    ...tenant,
    database: createPostgresClient({
      databaseName: tenantDatabaseNames[tenant.subdomain],
    }),
  }));

  try {
    const identities = await Promise.all(
      tenantDatabases.map(({ database }) => readDatabaseIdentity(database)),
    );
    if (
      new Set(identities.map(databaseIdentityKey)).size !== identities.length
    ) {
      throw new Error(
        "The configured BisBy tenant database names resolve to the same physical PostgreSQL database.",
      );
    }

    await migrateDatabase(masterDatabase, "master");
    for (const { database } of tenantDatabases) {
      await migrateDatabase(database, "tenant");
      await seedTenantDatabase(database, passwordHash);
    }
    await seedMasterDatabase(masterDatabase, tenantDatabaseNames);

    if (!configuredPassword) {
      console.warn(
        "Development administrator credentials were seeded with the built-in test default; change the password before production use.",
      );
    }
    console.log(
      "BisBy provisioning complete: master schema migrated; design and clientalpha tenant schemas migrated; eight modules activated; administrator accounts and workspace permissions upserted; repeatable seed successful.",
    );
  } finally {
    await Promise.all([
      masterDatabase.destroy(),
      ...tenantDatabases.map(({ database }) => database.destroy()),
    ]);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});