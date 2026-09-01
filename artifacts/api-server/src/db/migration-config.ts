import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationRoot = path.join(currentDirectory, "migrations");

export function migrationConfig(directory: string): Knex.MigratorConfig {
  return {
    directory: path.join(migrationRoot, directory),
    extension: "ts",
  };
}