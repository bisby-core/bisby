import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";
import { createMasterDatabase, createPostgresClient } from "./knex";
import { tenantRuntimeMigrationConfig } from "./tenant-runtime-migrations";

interface RegisteredTenant {
  readonly subdomain: string;
  readonly database_name: string;
}

interface TenantMigrationResult {
  readonly subdomain: string;
  readonly status: "migrated" | "failed";
  readonly error?: string;
}

export async function migrateRegisteredTenants(
  masterDatabase: Knex = createMasterDatabase(),
): Promise<readonly TenantMigrationResult[]> {
  const tenants = await masterDatabase<RegisteredTenant>("tenants")
    .select("subdomain", "database_name")
    .orderBy("subdomain");
  const results: TenantMigrationResult[] = [];

  for (const tenant of tenants) {
    const tenantDatabase = createPostgresClient({
      databaseName: tenant.database_name,
      pool: { min: 0, max: 1 },
    });
    try {
      await tenantDatabase.migrate.latest(tenantRuntimeMigrationConfig());
      results.push({ subdomain: tenant.subdomain, status: "migrated" });
    } catch (error) {
      results.push({
        subdomain: tenant.subdomain,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown migration failure",
      });
    } finally {
      await tenantDatabase.destroy();
    }
  }

  return results;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to migrate registered tenant databases without --confirm.",
    );
  }

  const masterDatabase = createMasterDatabase();
  try {
    const results = await migrateRegisteredTenants(masterDatabase);
    for (const result of results) {
      if (result.status === "migrated") {
        console.log(`${result.subdomain}: migrated`);
      } else {
        console.error(`${result.subdomain}: failed: ${result.error}`);
      }
    }
    if (results.some((result) => result.status === "failed")) {
      throw new Error("One or more registered tenant migrations failed.");
    }
  } finally {
    await masterDatabase.destroy();
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}