import type { Knex } from "knex";
import {
  MODULE_SCHEMA_NAMES,
  type ModuleSchemaName,
} from "../modules/module-schemas";

export const LOCAL_ACCOUNT_ROLES = [
  "tenant_admin",
  "module_admin",
  "module_staff",
  "client",
  "tenant_admin_staff",
] as const;

export type LocalAccountRole = (typeof LOCAL_ACCOUNT_ROLES)[number];

export interface LocalAccountAssignments {
  readonly moduleKey: ModuleSchemaName | null;
  readonly workspaceKeys: readonly string[];
  readonly workspaceAssignments: readonly WorkspaceAssignment[];
  readonly tenantAdminStaffWorkspaceKeys: readonly string[];
}

export interface WorkspaceAssignment {
  readonly moduleKey: ModuleSchemaName;
  readonly workspaceKey: string;
}

export function toLocalAccountRole(value: string): LocalAccountRole | null {
  // "staff" is the legacy value used by pre-role migrations.
  if (value === "staff") return "tenant_admin";
  if (LOCAL_ACCOUNT_ROLES.includes(value as LocalAccountRole)) {
    return value as LocalAccountRole;
  }
  return null;
}

export async function loadAccountAssignments(
  database: Knex,
  accountId: string,
  assignedModuleKey?: string | null,
): Promise<LocalAccountAssignments> {
  const rows = await database("core_admin.tab_permissions")
    .distinct("module_schema", "workspace_key")
    .where({ client_account_id: accountId, can_view: true });

  const tenantAdminStaffWorkspaceRows = await database<{ workspace_key: string }>(
    "core_admin.tenant_admin_staff_workspace_assignments",
  )
    .select("workspace_key")
    .where("account_id", accountId);
  const moduleKey =
    MODULE_SCHEMA_NAMES.find((value) => value === assignedModuleKey) ??
    rows
      .map((row) => row.module_schema)
      .find((value): value is ModuleSchemaName =>
        MODULE_SCHEMA_NAMES.includes(value as ModuleSchemaName),
      ) ??
    null;

  const workspaceAssignments = rows.flatMap((row) => {
    const rowModuleKey = MODULE_SCHEMA_NAMES.find(
      (value) => value === row.module_schema,
    );
    return rowModuleKey && typeof row.workspace_key === "string"
      ? [{ moduleKey: rowModuleKey, workspaceKey: row.workspace_key }]
      : [];
  });

  return {
    moduleKey,
    workspaceKeys: [...new Set(
      workspaceAssignments
        .filter((assignment) => !moduleKey || assignment.moduleKey === moduleKey)
        .map((assignment) => assignment.workspaceKey),
    )].sort(),
    workspaceAssignments,
    tenantAdminStaffWorkspaceKeys: tenantAdminStaffWorkspaceRows.map((row) => row.workspace_key).sort(),
  };
}

export function canAccessWorkspace(
  role: LocalAccountRole,
  assignedModule: ModuleSchemaName | null,
  workspaceAssignments: readonly WorkspaceAssignment[],
  enabledModules: readonly ModuleSchemaName[],
  moduleKey: ModuleSchemaName,
  workspaceKey: string,
): boolean {
  if (!enabledModules.includes(moduleKey)) return false;
  if (role === "tenant_admin_staff") return false;
  if (role === "tenant_admin") return true;
  if (role === "module_admin") return assignedModule === moduleKey;
  if (role === "module_staff" && assignedModule !== moduleKey) return false;
  return workspaceAssignments.some(
    (assignment) =>
      assignment.moduleKey === moduleKey &&
      assignment.workspaceKey === workspaceKey,
  );
}