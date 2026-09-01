import type { Knex } from "knex";
import { normalizedMetadata, type WorkspaceAccessLevel, type WorkspaceMetadata, type PublicWorkspace, type WorkspaceNode } from "../tenant-administration/public-workspaces";

interface Row { id: string; workspace_key: string; display_name: string; workspace_type: "normal" | "public_information" | "contact_us"; is_active: boolean; public_visible: boolean; contact_enabled: boolean; sort_order: number; updated_at: Date | string; }
interface NodeRow { id: string; workspace_id: string; parent_id: string | null; node_type: WorkspaceNode["type"]; node_key: string; display_name: string; sort_order: number; access_level: WorkspaceAccessLevel; }
export interface ManagedPlatformWorkspace extends Omit<PublicWorkspace, "moduleKey"> { readonly contentNodes: readonly WorkspaceNode[]; }
const serialize = (r: Row): PublicWorkspace => ({ scope: "platform", moduleKey: null, workspaceKey: r.workspace_key, displayName: r.display_name, workspaceType: r.workspace_type, isActive: r.is_active, publicVisible: r.public_visible, contactEnabled: r.contact_enabled });
const serializeNode = (r: NodeRow): WorkspaceNode => ({ id: r.id, parentId: r.parent_id, type: r.node_type, key: r.node_key, displayName: r.display_name, sortOrder: r.sort_order, accessLevel: r.access_level });
async function managed(db: Knex, row: Row): Promise<ManagedPlatformWorkspace> { const contentNodes = await db<NodeRow>("platform_workspace_content_nodes").select("id", "parent_id", "node_type", "node_key", "display_name", "sort_order", "access_level").where({ workspace_id: row.id }).orderBy("sort_order"); const { moduleKey: _moduleKey, ...workspace } = serialize(row); return { ...workspace, contentNodes: contentNodes.map(serializeNode) }; }
async function nodes(tx: Knex.Transaction, id: string): Promise<void> {
  const [page] = await tx("platform_workspace_content_nodes").insert({ workspace_id: id, node_type: "page", node_key: "workspace", display_name: "Workspace", sort_order: 0 }).returning(["id"]);
  const [tab] = await tx("platform_workspace_content_nodes").insert({ workspace_id: id, parent_id: page.id, node_type: "tab", node_key: "overview", display_name: "Overview", sort_order: 0 }).returning(["id"]);
  await tx("platform_workspace_content_nodes").insert({ workspace_id: id, parent_id: tab.id, node_type: "card", node_key: "content", display_name: "Content", sort_order: 0 });
}
export async function listPlatformWorkspaces(db: Knex, publicOnly = false): Promise<{ workspaces: readonly (PublicWorkspace | ManagedPlatformWorkspace)[] }> {
  let query = db<Row>("platform_workspaces").select("*").orderBy("sort_order");
  if (publicOnly) query = query.where("is_active", true).andWhere("public_visible", true).andWhere((q) => q.whereNot("workspace_type", "contact_us").orWhere("contact_enabled", true));
  const rows = await query;
  return { workspaces: publicOnly ? rows.map(serialize) : await Promise.all(rows.map(row => managed(db, row))) };
}
export async function createPlatformWorkspace(db: Knex, metadata: WorkspaceMetadata): Promise<ManagedPlatformWorkspace> {
  metadata = normalizedMetadata(metadata);
  return db.transaction(async tx => {
    await tx.raw("select pg_advisory_xact_lock(hashtext(?))", ["bisby-platform-workspace"]); const rows = await tx<Row>("platform_workspaces").select("workspace_key", "sort_order").forUpdate();
    const key = `pws-${Math.max(0, ...rows.map(r => Number(/^pws-(\d+)$/.exec(r.workspace_key)?.[1] ?? 0))) + 1}`;
    const [row] = await tx<Row>("platform_workspaces").insert({ workspace_key: key, display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, sort_order: Math.max(-1, ...rows.map(r => r.sort_order)) + 1 }).returning("*");
    await nodes(tx, row.id); return managed(tx, row);
  });
}
export async function updatePlatformWorkspace(db: Knex, key: string, metadata: WorkspaceMetadata): Promise<ManagedPlatformWorkspace | null> {
  metadata = normalizedMetadata(metadata);
  const [row] = await db<Row>("platform_workspaces").where({ workspace_key: key }).update({ display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, updated_at: db.fn.now() }).returning("*");
  return row ? managed(db, row) : null;
}
export async function removePlatformWorkspace(db: Knex, key: string): Promise<boolean> { return (await db("platform_workspaces").where({ workspace_key: key }).delete()) === 1; }
export async function updatePlatformWorkspaceAccess(db: Knex, key: string, controls: readonly { nodeId: string; accessLevel: WorkspaceAccessLevel }[]): Promise<ManagedPlatformWorkspace | null> {
  return db.transaction(async tx => { const workspace = await tx<Row>("platform_workspaces").where({ workspace_key: key }).forUpdate().first(); if (!workspace) return null; const ids = [...new Set(controls.map(c => c.nodeId))]; const found = await tx<NodeRow>("platform_workspace_content_nodes").select("id").where({ workspace_id: workspace.id }).whereIn("id", ids).forUpdate(); if (found.length !== ids.length) throw new Error("workspace control not found"); for (const control of controls) await tx("platform_workspace_content_nodes").where({ id: control.nodeId, workspace_id: workspace.id }).update({ access_level: control.accessLevel, updated_at: tx.fn.now() }); return managed(tx, workspace); });
}