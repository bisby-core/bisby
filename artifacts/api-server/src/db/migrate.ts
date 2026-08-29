import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";
import { createMasterDatabase, createPostgresClient } from "./knex";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationRoot = path.join(currentDirectory, "migrations");

export function migrationConfig(directory: string): Knex.MigratorConfig {
  return {
    directory: path.join(migrationRoot, directory),
    extension: "ts",
  };
}

function createMigrationDatabase(target: string): Knex {
  if (target === "master") {
    return createMasterDatabase();
  }

  if (target === "tenant") {
    const connectionString = process.env["BISBY_TENANT_DATABASE_URL"];
    if (!connectionString) {
      throw new Error(
        "BISBY_TENANT_DATABASE_URL must be configured for tenant blueprint migrations.",
      );
    }
    return createPostgresClient(connectionString);
  }

  throw new Error('Migration target must be either "master" or "tenant".');
}

const target = process.argv[2] ?? "master";

export async function runMigrations(target: string): Promise<void> {
  const database = createMigrationDatabase(target);
  try {
    await database.migrate.latest(migrationConfig(target));
  } finally {
    await database.destroy();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  void runMigrations(target).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}