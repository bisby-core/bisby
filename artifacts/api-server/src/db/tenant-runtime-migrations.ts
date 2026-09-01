import type { Knex } from "knex";
import * as createTenantBlueprint from "./migrations/tenant/20260829000000_create_tenant_database_blueprint";
import * as addRouteAssignmentFields from "./migrations/tenant/20260829000001_add_route_assignment_fields";

interface RuntimeMigration {
  readonly name: string;
  readonly up: (database: Knex) => Promise<void>;
  readonly down: (database: Knex) => Promise<void>;
}

const migrations: readonly RuntimeMigration[] = [
  {
    name: "20260829000000_create_tenant_database_blueprint.ts",
    ...createTenantBlueprint,
  },
  {
    name: "20260829000001_add_route_assignment_fields.ts",
    ...addRouteAssignmentFields,
  },
];

const migrationSource: Knex.MigrationSource<RuntimeMigration> = {
  getMigrations: async () => [...migrations],
  getMigrationName: (migration) => migration.name,
  getMigration: async (migration) => ({
    up: migration.up,
    down: migration.down,
  }),
};

export function tenantRuntimeMigrationConfig(): Knex.MigratorConfig {
  return { migrationSource };
}