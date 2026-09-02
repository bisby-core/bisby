import type { Knex } from "knex";
import * as createTenantBlueprint from "./migrations/tenant/20260829000000_create_tenant_database_blueprint";
import * as addRouteAssignmentFields from "./migrations/tenant/20260829000001_add_route_assignment_fields";
import * as addPasswordChangeRequirement from "./migrations/tenant/20260901020000_add_password_change_requirement";
import * as addAdministrationRoles from "./migrations/tenant/20260901030000_add_administration_roles";
import * as addWorkspaceControlRegistry from "./migrations/tenant/20260901040000_add_workspace_control_registry";
import * as addPublicWorkspaceRegistries from "./migrations/tenant/20260901050000_add_public_workspace_registries";
import * as enforceModuleWorkspaceMetadata from "./migrations/tenant/20260901060000_enforce_module_workspace_metadata";
import * as addTenantAdminStaffWorkspaces from "./migrations/tenant/20260901070000_add_tenant_admin_staff_workspaces";
import * as addTenantAdminStaffWorkspaceContentNodes from "./migrations/tenant/20260901080000_add_tenant_admin_staff_workspace_content_nodes";
import * as seedTenantAdminStaffWorkspaceMatrix from "./migrations/tenant/20260902000000_seed_tenant_admin_staff_workspace_matrix";

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
  {
    name: "20260901020000_add_password_change_requirement.ts",
    ...addPasswordChangeRequirement,
  },
  {
    name: "20260901030000_add_administration_roles.ts",
    ...addAdministrationRoles,
  },
  {
    name: "20260901040000_add_workspace_control_registry.ts",
    ...addWorkspaceControlRegistry,
  },
  {
    name: "20260901050000_add_public_workspace_registries.ts",
    ...addPublicWorkspaceRegistries,
  },
  {
    name: "20260901060000_enforce_module_workspace_metadata.ts",
    ...enforceModuleWorkspaceMetadata,
  },
  {
    name: "20260901070000_add_tenant_admin_staff_workspaces.ts",
    ...addTenantAdminStaffWorkspaces,
  },
  {
    name: "20260901080000_add_tenant_admin_staff_workspace_content_nodes.ts",
    ...addTenantAdminStaffWorkspaceContentNodes,
  },
  {
    name: "20260902000000_seed_tenant_admin_staff_workspace_matrix.ts",
    ...seedTenantAdminStaffWorkspaceMatrix,
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