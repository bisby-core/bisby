import type { Knex } from "knex";
import type { ModuleSchemaName } from "../modules/module-schemas";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import { TenantAdministrationError } from "./accounts";
import { normalizedMetadata, type WorkspaceMetadata } from "./public-workspaces";

export const WORKSPACE_ACCESS_LEVELS = [
  "active",
  "sign_only",
  "view_only",
  "not_available",
] as const;

export type WorkspaceAccessLevel = (typeof WORKSPACE_ACCESS_LEVELS)[number];
export type WorkspaceContentNodeType = "page" | "tab" | "card";

interface WorkspaceRow {
  readonly id: string;
  readonly module_schema: ModuleSchemaName;
  readonly workspace_key: string;
  readonly display_name: string;
  readonly sort_order: number;
  readonly is_active: boolean;
  readonly workspace_type: "normal" | "public_information" | "contact_us";
  readonly public_visible: boolean;
  readonly contact_enabled: boolean;
  readonly updated_at?: Date | string;
  readonly created_at: Date | string;
}

interface WorkspaceContentNodeRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly parent_id: string | null;
  readonly module_schema: ModuleSchemaName;
  readonly node_type: WorkspaceContentNodeType;
  readonly node_key: string;
  readonly display_name: string;
  readonly sort_order: number;
  readonly access_level: WorkspaceAccessLevel;
}

export interface WorkspaceContentNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly type: WorkspaceContentNodeType;
  readonly key: string;
  readonly displayName: string;
  readonly sortOrder: number;
  readonly accessLevel: WorkspaceAccessLevel;
}

export interface ManagedModuleWorkspace {
  readonly id: string;
  readonly moduleKey: ModuleSchemaName;
  readonly workspaceKey: string;
  readonly displayName: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly workspaceType: "normal" | "public_information" | "contact_us";
  readonly publicVisible: boolean;
  readonly contactEnabled: boolean;
  readonly createdAt: string;
  readonly contentNodes: readonly WorkspaceContentNode[];
}

export interface WorkspaceControlSnapshot {
  readonly moduleKey: ModuleSchemaName;
  readonly workspaces: readonly ManagedModuleWorkspace[];
}

const DEFAULT_CONTENT_NODES = [
  { type: "page", key: "workspace", displayName: "Workspace", parentKey: null, sortOrder: 0 },
  { type: "tab", key: "overview", displayName: "Overview", parentKey: "page:workspace", sortOrder: 0 },
  { type: "card", key: "destination-status", displayName: "Destination status", parentKey: "tab:overview", sortOrder: 0 },
  { type: "card", key: "access-boundary", displayName: "Access boundary", parentKey: "tab:overview", sortOrder: 1 },
  { type: "card", key: "session-status", displayName: "Session status", parentKey: "tab:overview", sortOrder: 2 },
] as const;

function assertModuleAdministrator(
  actor: AuthenticatedLocalUser,
  enabledModules: readonly ModuleSchemaName[],
): asserts actor is AuthenticatedLocalUser & { readonly moduleKey: ModuleSchemaName } {
  if (
    actor.role !== "module_admin" ||
    !actor.moduleKey ||
    !enabledModules.includes(actor.moduleKey)
  ) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "Only an administrator of an active module can control its workspaces.",
    );
  }
}

function serializeWorkspace(
  workspace: WorkspaceRow,
  nodes: readonly WorkspaceContentNodeRow[],
): ManagedModuleWorkspace {
  return {
    id: workspace.id,
    moduleKey: workspace.module_schema,
    workspaceKey: workspace.workspace_key,
    displayName: workspace.display_name,
    sortOrder: workspace.sort_order,
    isActive: workspace.is_active,
    workspaceType: workspace.workspace_type,
    publicVisible: workspace.public_visible,
    contactEnabled: workspace.contact_enabled,
    createdAt: new Date(workspace.created_at).toISOString(),
    contentNodes: nodes
      .filter((node) => node.workspace_id === workspace.id)
      .sort((left, right) => {
        const typeOrder = { page: 0, tab: 1, card: 2 };
        return typeOrder[left.node_type] - typeOrder[right.node_type] ||
          left.sort_order - right.sort_order ||
          left.display_name.localeCompare(right.display_name);
      })
      .map((node) => ({
        id: node.id,
        parentId: node.parent_id,
        type: node.node_type,
        key: node.node_key,
        displayName: node.display_name,
        sortOrder: node.sort_order,
        accessLevel: node.access_level,
      })),
  };
}

async function loadWorkspace(
  database: Knex,
  moduleKey: ModuleSchemaName,
  workspaceKey: string,
  forUpdate = false,
): Promise<WorkspaceRow> {
  let query = database<WorkspaceRow>("core_admin.module_workspaces")
    .select(
      "id",
      "module_schema",
      "workspace_key",
      "display_name",
      "sort_order",
      "is_active",
      "workspace_type", "public_visible", "contact_enabled",
      "created_at",
    )
    .where({ module_schema: moduleKey, workspace_key: workspaceKey });
  if (forUpdate) query = query.forUpdate();
  const workspace = await query.first();
  if (!workspace) {
    throw new TenantAdministrationError(
      "managed_account_not_found",
      "That workspace was not found in this module.",
    );
  }
  return workspace;
}

async function recordWorkspaceAudit(
  transaction: Knex.Transaction,
  actor: AuthenticatedLocalUser,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  await transaction("core_admin.administration_audit_log").insert({
    event_type: eventType,
    actor_account_id: actor.accountId,
    actor_username: actor.username,
    target_account_id: actor.accountId,
    details,
  });
}

export async function listModuleWorkspaces(
  database: Knex,
  actor: AuthenticatedLocalUser,
  enabledModules: readonly ModuleSchemaName[],
): Promise<WorkspaceControlSnapshot> {
  assertModuleAdministrator(actor, enabledModules);
  const workspaces = await database<WorkspaceRow>("core_admin.module_workspaces")
    .select(
      "id",
      "module_schema",
      "workspace_key",
      "display_name",
      "sort_order",
      "is_active",
      "workspace_type", "public_visible", "contact_enabled",
      "created_at",
    )
    .where({ module_schema: actor.moduleKey })
    .orderBy([{ column: "sort_order", order: "asc" }, { column: "workspace_key", order: "asc" }]);
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const nodes = workspaceIds.length
    ? await database<WorkspaceContentNodeRow>("core_admin.workspace_content_nodes")
        .select(
          "id",
          "workspace_id",
          "parent_id",
          "module_schema",
          "node_type",
          "node_key",
          "display_name",
          "sort_order",
          "access_level",
        )
        .whereIn("workspace_id", workspaceIds)
    : [];
  return {
    moduleKey: actor.moduleKey,
    workspaces: workspaces.map((workspace) => serializeWorkspace(workspace, nodes)),
  };
}

export async function createModuleWorkspace(
  database: Knex,
  actor: AuthenticatedLocalUser,
  displayName: string,
  enabledModules: readonly ModuleSchemaName[],
): Promise<ManagedModuleWorkspace> {
  assertModuleAdministrator(actor, enabledModules);
  return database.transaction(async (transaction) => {
    await transaction.raw(
      "select pg_advisory_xact_lock(hashtext(?))",
      [`bisby-workspace:${actor.moduleKey}`],
    );
    const existing = await transaction<WorkspaceRow>("core_admin.module_workspaces")
      .select("workspace_key", "sort_order")
      .where({ module_schema: actor.moduleKey })
      .forUpdate();
    const numbers = existing
      .map((workspace) => /^ws-(\d+)$/.exec(workspace.workspace_key)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    const nextNumber = Math.max(0, ...numbers) + 1;
    const workspaceKey = `ws-${nextNumber}`;
    const sortOrder = Math.max(-1, ...existing.map((workspace) => workspace.sort_order)) + 1;
    const [workspace] = await transaction<WorkspaceRow>("core_admin.module_workspaces")
      .insert({
        module_schema: actor.moduleKey,
        workspace_key: workspaceKey,
        display_name: displayName,
        sort_order: sortOrder,
        is_active: true,
      })
      .returning([
        "id",
        "module_schema",
        "workspace_key",
        "display_name",
        "sort_order",
        "is_active",
        "workspace_type", "public_visible", "contact_enabled",
        "created_at",
      ]);
    if (!workspace) {
      throw new TenantAdministrationError(
        "managed_account_conflict",
        "The workspace could not be created.",
      );
    }

    const parentIds = new Map<string, string>();
    const nodes: WorkspaceContentNodeRow[] = [];
    for (const node of DEFAULT_CONTENT_NODES) {
      const [created] = await transaction<WorkspaceContentNodeRow>(
        "core_admin.workspace_content_nodes",
      )
        .insert({
          workspace_id: workspace.id,
          parent_id: node.parentKey ? parentIds.get(node.parentKey) ?? null : null,
          module_schema: actor.moduleKey,
          node_type: node.type,
          node_key: node.key,
          display_name: node.displayName,
          sort_order: node.sortOrder,
          access_level: "active",
        })
        .returning([
          "id",
          "workspace_id",
          "parent_id",
          "module_schema",
          "node_type",
          "node_key",
          "display_name",
          "sort_order",
          "access_level",
        ]);
      if (!created) {
        throw new TenantAdministrationError(
          "managed_account_conflict",
          "The workspace content controls could not be created.",
        );
      }
      parentIds.set(`${node.type}:${node.key}`, created.id);
      nodes.push(created);
    }

    await recordWorkspaceAudit(transaction, actor, "tenant.module_workspace.created", {
      moduleKey: actor.moduleKey,
      workspaceKey,
      displayName,
    });
    return serializeWorkspace(workspace, nodes);
  });
}

export async function removeModuleWorkspace(
  database: Knex,
  actor: AuthenticatedLocalUser,
  workspaceKey: string,
  enabledModules: readonly ModuleSchemaName[],
): Promise<{ readonly status: "workspace_removed"; readonly workspaceKey: string }> {
  assertModuleAdministrator(actor, enabledModules);
  return database.transaction(async (transaction) => {
    const workspace = await loadWorkspace(
      transaction,
      actor.moduleKey,
      workspaceKey,
      true,
    );
    await transaction("core_admin.tab_permissions")
      .where({ module_schema: actor.moduleKey, workspace_key: workspaceKey })
      .delete();
    await transaction("core_admin.module_workspaces").where({ id: workspace.id }).delete();
    await recordWorkspaceAudit(transaction, actor, "tenant.module_workspace.removed", {
      moduleKey: actor.moduleKey,
      workspaceKey,
      displayName: workspace.display_name,
    });
    return { status: "workspace_removed", workspaceKey };
  });
}

export async function updateWorkspaceContentAccess(
  database: Knex,
  actor: AuthenticatedLocalUser,
  workspaceKey: string,
  updates: readonly { readonly nodeId: string; readonly accessLevel: WorkspaceAccessLevel }[],
  enabledModules: readonly ModuleSchemaName[],
): Promise<ManagedModuleWorkspace> {
  assertModuleAdministrator(actor, enabledModules);
  return database.transaction(async (transaction) => {
    const workspace = await loadWorkspace(
      transaction,
      actor.moduleKey,
      workspaceKey,
      true,
    );
    const requestedIds = [...new Set(updates.map((update) => update.nodeId))];
    const nodes = requestedIds.length
      ? await transaction<WorkspaceContentNodeRow>("core_admin.workspace_content_nodes")
          .select("id")
          .where("workspace_id", workspace.id)
          .andWhere("module_schema", actor.moduleKey)
          .whereIn("id", requestedIds)
          .forUpdate()
      : [];
    if (nodes.length !== requestedIds.length) {
      throw new TenantAdministrationError(
        "managed_account_not_found",
        "One or more workspace controls were not found.",
      );
    }
    for (const update of updates) {
      await transaction("core_admin.workspace_content_nodes")
        .where({ id: update.nodeId, workspace_id: workspace.id })
        .update({
          access_level: update.accessLevel,
          updated_at: transaction.fn.now(),
        });
    }
    await recordWorkspaceAudit(transaction, actor, "tenant.module_workspace.access_updated", {
      moduleKey: actor.moduleKey,
      workspaceKey,
      controls: updates.map((update) => ({
        nodeId: update.nodeId,
        accessLevel: update.accessLevel,
      })),
    });
    const refreshedNodes = await transaction<WorkspaceContentNodeRow>(
      "core_admin.workspace_content_nodes",
    )
      .select(
        "id",
        "workspace_id",
        "parent_id",
        "module_schema",
        "node_type",
        "node_key",
        "display_name",
        "sort_order",
        "access_level",
      )
      .where({ workspace_id: workspace.id });
    return serializeWorkspace(workspace, refreshedNodes);
  });
}

export async function activeWorkspaceKeysForModule(
  database: Knex,
  moduleKey: ModuleSchemaName,
): Promise<readonly string[]> {
  const rows = await database<{ workspace_key: string }>("core_admin.module_workspaces")
    .select("workspace_key")
    .where("module_schema", moduleKey)
    .andWhere("is_active", true)
    .orderBy([{ column: "sort_order", order: "asc" }, { column: "workspace_key", order: "asc" }]);
  return rows.map((row) => row.workspace_key);
}

export async function workspaceExists(
  database: Knex,
  moduleKey: ModuleSchemaName,
  workspaceKey: string,
): Promise<boolean> {
  const workspace = await database("core_admin.module_workspaces")
    .select("id")
    .where({ module_schema: moduleKey, workspace_key: workspaceKey, is_active: true })
    .first();
  return Boolean(workspace);
}

export async function resolveWorkspaceContentAccess(
  database: Knex,
  actor: AuthenticatedLocalUser,
  moduleKey: ModuleSchemaName,
  workspaceKey: string,
  nodeType: WorkspaceContentNodeType,
  nodeKey: string,
): Promise<WorkspaceAccessLevel | null> {
  const workspace = await database<WorkspaceRow>("core_admin.module_workspaces")
    .select("id")
    .where({
      module_schema: moduleKey,
      workspace_key: workspaceKey,
      is_active: true,
    })
    .first();
  if (!workspace) return null;
  if (actor.role === "tenant_admin" || actor.role === "module_admin") return "active";

  const nodes = await database<WorkspaceContentNodeRow>(
    "core_admin.workspace_content_nodes",
  )
    .select(
      "id",
      "workspace_id",
      "parent_id",
      "module_schema",
      "node_type",
      "node_key",
      "display_name",
      "sort_order",
      "access_level",
    )
    .where({ workspace_id: workspace.id });
  let current = nodes.find(
    (node) => node.node_type === nodeType && node.node_key === nodeKey,
  );
  if (!current) return null;

  const rank: Record<WorkspaceAccessLevel, number> = {
    not_available: 0,
    view_only: 1,
    sign_only: 2,
    active: 3,
  };
  let effective = current.access_level;
  const visited = new Set<string>();
  while (current.parent_id && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = nodes.find((node) => node.id === current?.parent_id);
    if (!parent) break;
    if (rank[parent.access_level] < rank[effective]) {
      effective = parent.access_level;
    }
    current = parent;
  }
  return effective;
}

export async function updateModuleWorkspaceMetadata(
  database: Knex, actor: AuthenticatedLocalUser, workspaceKey: string,
  metadata: WorkspaceMetadata, enabledModules: readonly ModuleSchemaName[],
): Promise<ManagedModuleWorkspace> {
  assertModuleAdministrator(actor, enabledModules);
  metadata = normalizedMetadata(metadata);
  return database.transaction(async (transaction) => {
    const workspace = await loadWorkspace(transaction, actor.moduleKey, workspaceKey, true);
    const [updated] = await transaction<WorkspaceRow>("core_admin.module_workspaces")
      .where({ id: workspace.id })
      .update({ display_name: metadata.displayName, is_active: metadata.isActive, workspace_type: metadata.workspaceType, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, updated_at: transaction.fn.now() })
      .returning(["id", "module_schema", "workspace_key", "display_name", "sort_order", "is_active", "workspace_type", "public_visible", "contact_enabled", "created_at"]);
    if (!updated) throw new TenantAdministrationError("managed_account_not_found", "That workspace was not found in this module.");
    const nodes = await transaction<WorkspaceContentNodeRow>("core_admin.workspace_content_nodes").select("id", "workspace_id", "parent_id", "module_schema", "node_type", "node_key", "display_name", "sort_order", "access_level").where({ workspace_id: workspace.id });
    await recordWorkspaceAudit(transaction, actor, "tenant.module_workspace.updated", { moduleKey: actor.moduleKey, workspaceKey, metadata });
    return serializeWorkspace(updated, nodes);
  });
}