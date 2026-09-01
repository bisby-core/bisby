import type { Knex } from "knex";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import type { ModuleSchemaName } from "../modules/module-schemas";
import { TenantAdministrationError } from "./accounts";

export type WorkspaceType = "normal" | "public_information" | "contact_us";
export type WorkspaceAccessLevel = "active" | "sign_only" | "view_only" | "not_available";
export interface WorkspaceMetadata { readonly displayName: string; readonly isActive: boolean; readonly workspaceType: WorkspaceType; readonly publicVisible: boolean; readonly contactEnabled: boolean; }
export interface WorkspaceNode { readonly id: string; readonly parentId: string | null; readonly type: "page" | "tab" | "card"; readonly key: string; readonly displayName: string; readonly sortOrder: number; readonly accessLevel: WorkspaceAccessLevel; }
export interface ManagedRegistryWorkspace extends WorkspaceMetadata { readonly scope: "tenant" | "platform"; readonly workspaceKey: string; readonly contentNodes: readonly WorkspaceNode[]; }
export interface PublicWorkspace extends WorkspaceMetadata { readonly scope: "tenant" | "module" | "platform"; readonly moduleKey: ModuleSchemaName | null; readonly workspaceKey: string; }
interface Row { id: string; workspace_key: string; display_name: string; workspace_type: WorkspaceType; is_active: boolean; public_visible: boolean; contact_enabled: boolean; sort_order: number; updated_at?: Date | string; module_schema?: ModuleSchemaName; }
interface NodeRow { id: string; workspace_id: string; parent_id: string | null; node_type: WorkspaceNode["type"]; node_key: string; display_name: string; sort_order: number; access_level: WorkspaceAccessLevel; }
export function normalizedMetadata(metadata: WorkspaceMetadata): WorkspaceMetadata {
  if (metadata.workspaceType === "normal") return { ...metadata, publicVisible: false, contactEnabled: false };
  if (metadata.workspaceType === "public_information") return { ...metadata, contactEnabled: false };
  return metadata;
}
export function publicModuleIsEnabled(
  moduleSchema: ModuleSchemaName | undefined,
  enabledModules: readonly ModuleSchemaName[],
): boolean {
  return moduleSchema !== undefined && enabledModules.includes(moduleSchema);
}
function publicRow(row: Row, scope: PublicWorkspace["scope"]): PublicWorkspace { return { scope, moduleKey: row.module_schema ?? null, workspaceKey: row.workspace_key, displayName: row.display_name, workspaceType: row.workspace_type, isActive: row.is_active, publicVisible: row.public_visible, contactEnabled: row.contact_enabled }; }
function node(row: NodeRow): WorkspaceNode { return { id: row.id, parentId: row.parent_id, type: row.node_type, key: row.node_key, displayName: row.display_name, sortOrder: row.sort_order, accessLevel: row.access_level }; }
function tenantAdmin(actor: AuthenticatedLocalUser): void { if (actor.role !== "tenant_admin") throw new TenantAdministrationError("administration_forbidden", "Only tenant administrators can manage tenant workspaces."); }
async function insertNodes(tx: Knex.Transaction, id: string): Promise<void> {
  const [page] = await tx("core_admin.tenant_workspace_content_nodes").insert({ workspace_id: id, node_type: "page", node_key: "workspace", display_name: "Workspace", sort_order: 0, access_level: "active" }).returning(["id"]);
  const [tab] = await tx("core_admin.tenant_workspace_content_nodes").insert({ workspace_id: id, parent_id: page.id, node_type: "tab", node_key: "overview", display_name: "Overview", sort_order: 0, access_level: "active" }).returning(["id"]);
  await tx("core_admin.tenant_workspace_content_nodes").insert({ workspace_id: id, parent_id: tab.id, node_type: "card", node_key: "content", display_name: "Content", sort_order: 0, access_level: "active" });
}
async function managed(db: Knex, row: Row): Promise<ManagedRegistryWorkspace> {
  const rows = await db<NodeRow>("core_admin.tenant_workspace_content_nodes").select("id", "parent_id", "node_type", "node_key", "display_name", "sort_order", "access_level").where({ workspace_id: row.id }).orderBy("sort_order");
  return {
    scope: "tenant",
    workspaceKey: row.workspace_key,
    displayName: row.display_name,
    workspaceType: row.workspace_type,
    isActive: row.is_active,
    publicVisible: row.public_visible,
    contactEnabled: row.contact_enabled,
    contentNodes: rows.map(node),
  };
}
export async function listTenantWorkspaces(db: Knex, actor: AuthenticatedLocalUser): Promise<{ workspaces: readonly ManagedRegistryWorkspace[] }> { tenantAdmin(actor); return { workspaces: await Promise.all((await db<Row>("core_admin.tenant_workspaces").select("*").orderBy("sort_order")).map(row => managed(db, row))) }; }
export async function createTenantWorkspace(db: Knex, actor: AuthenticatedLocalUser, input: WorkspaceMetadata): Promise<ManagedRegistryWorkspace> {
  tenantAdmin(actor); const metadata = normalizedMetadata(input);
  return db.transaction(async tx => { await tx.raw("select pg_advisory_xact_lock(hashtext(?))", ["bisby-tenant-workspace"]); const rows = await tx<Row>("core_admin.tenant_workspaces").select("workspace_key", "sort_order").forUpdate(); const key = `tws-${Math.max(0, ...rows.map(r => Number(/^tws-(\d+)$/.exec(r.workspace_key)?.[1] ?? 0))) + 1}`; const [row] = await tx<Row>("core_admin.tenant_workspaces").insert({ workspace_key: key, display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, sort_order: Math.max(-1, ...rows.map(r => r.sort_order)) + 1 }).returning("*"); await insertNodes(tx, row.id); await tx("core_admin.administration_audit_log").insert({ event_type: "tenant.workspace.created", actor_account_id: actor.accountId, actor_username: actor.username, target_account_id: actor.accountId, details: { workspaceKey: key } }); return managed(tx, row); });
}
export async function updateTenantWorkspace(db: Knex, actor: AuthenticatedLocalUser, workspaceKey: string, input: WorkspaceMetadata): Promise<ManagedRegistryWorkspace> {
  tenantAdmin(actor); const metadata = normalizedMetadata(input);
  return db.transaction(async tx => { const [row] = await tx<Row>("core_admin.tenant_workspaces").where({ workspace_key: workspaceKey }).update({ display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, updated_at: tx.fn.now() }).returning("*"); if (!row) throw new TenantAdministrationError("managed_account_not_found", "That tenant workspace was not found."); await tx("core_admin.administration_audit_log").insert({ event_type: "tenant.workspace.updated", actor_account_id: actor.accountId, actor_username: actor.username, target_account_id: actor.accountId, details: { workspaceKey } }); return managed(tx, row); });
}
export async function updateTenantWorkspaceAccess(db: Knex, actor: AuthenticatedLocalUser, workspaceKey: string, controls: readonly { nodeId: string; accessLevel: WorkspaceAccessLevel }[]): Promise<ManagedRegistryWorkspace> {
  tenantAdmin(actor); return db.transaction(async tx => { const workspace = await tx<Row>("core_admin.tenant_workspaces").where({ workspace_key: workspaceKey }).forUpdate().first(); if (!workspace) throw new TenantAdministrationError("managed_account_not_found", "That tenant workspace was not found."); const ids = [...new Set(controls.map(c => c.nodeId))]; const found = await tx<NodeRow>("core_admin.tenant_workspace_content_nodes").select("id").where({ workspace_id: workspace.id }).whereIn("id", ids).forUpdate(); if (found.length !== ids.length) throw new TenantAdministrationError("managed_account_not_found", "One or more workspace controls were not found."); for (const c of controls) await tx("core_admin.tenant_workspace_content_nodes").where({ id: c.nodeId, workspace_id: workspace.id }).update({ access_level: c.accessLevel, updated_at: tx.fn.now() }); await tx("core_admin.administration_audit_log").insert({ event_type: "tenant.workspace.access_updated", actor_account_id: actor.accountId, actor_username: actor.username, target_account_id: actor.accountId, details: { workspaceKey, controls } }); return managed(tx, workspace); });
}
export async function removeTenantWorkspace(db: Knex, actor: AuthenticatedLocalUser, workspaceKey: string): Promise<{ status: "workspace_removed"; workspaceKey: string }> { tenantAdmin(actor); const deleted = await db("core_admin.tenant_workspaces").where({ workspace_key: workspaceKey }).delete(); if (deleted !== 1) throw new TenantAdministrationError("managed_account_not_found", "That tenant workspace was not found."); return { status: "workspace_removed", workspaceKey }; }
export async function listPublicTenantWorkspaces(
  db: Knex,
  enabledModules: readonly ModuleSchemaName[],
): Promise<{ workspaces: readonly PublicWorkspace[] }> {
  const [tenant, modules] = await Promise.all([
    db<Row>("core_admin.tenant_workspaces")
      .select("*")
      .where("is_active", true)
      .andWhere("public_visible", true)
      .andWhere((query) =>
        query.whereNot("workspace_type", "contact_us").orWhere("contact_enabled", true),
      )
      .orderBy("sort_order"),
    db<Row>("core_admin.module_workspaces")
      .select("*")
      .whereIn("module_schema", enabledModules)
      .andWhere("is_active", true)
      .andWhere("public_visible", true)
      .andWhere((query) =>
        query.whereNot("workspace_type", "contact_us").orWhere("contact_enabled", true),
      )
      .orderBy([
        { column: "module_schema", order: "asc" },
        { column: "sort_order", order: "asc" },
      ]),
  ]);
  return {
    workspaces: [
      ...tenant.map((row) => publicRow(row, "tenant")),
      ...modules
        .filter((row) => publicModuleIsEnabled(row.module_schema, enabledModules))
        .map((row) => publicRow(row, "module")),
    ],
  };
}