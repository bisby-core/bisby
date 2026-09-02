import type { Knex } from "knex";
import { normalizedMetadata, type WorkspaceAccessLevel, type WorkspaceMetadata, type PublicWorkspace, type WorkspaceNode } from "../tenant-administration/public-workspaces";
import type { WorkspaceHierarchyInput } from "../tenant-administration/workspaces";

interface Row { id: string; workspace_key: string; display_name: string; workspace_type: "normal" | "public_information" | "contact_us"; is_active: boolean; public_visible: boolean; contact_enabled: boolean; sort_order: number; updated_at: Date | string; }
interface NodeRow { id: string; workspace_id: string; parent_id: string | null; node_type: WorkspaceNode["type"]; node_key: string; display_name: string; sort_order: number; access_level: WorkspaceAccessLevel; }
export interface ManagedPlatformWorkspace extends Omit<PublicWorkspace, "moduleKey"> { readonly contentNodes: readonly WorkspaceNode[]; }
export class PlatformWorkspaceHierarchyError extends Error {
  public constructor(
    public readonly code:
      | "invalid_platform_workspace_hierarchy_parent"
      | "platform_workspace_hierarchy_key_conflict"
      | "platform_workspace_hierarchy_node_not_found",
    message: string,
  ) {
    super(message);
    this.name = "PlatformWorkspaceHierarchyError";
  }
}
const serialize = (r: Row): PublicWorkspace => ({ scope: "platform", moduleKey: null, workspaceKey: r.workspace_key, displayName: r.display_name, workspaceType: r.workspace_type, isActive: r.is_active, publicVisible: r.public_visible, contactEnabled: r.contact_enabled });
const serializeNodes = (rows: readonly NodeRow[]): WorkspaceNode[] => { const byId = new Map(rows.map(row => [row.id, row])); return rows.map(r => { const parent = r.parent_id ? byId.get(r.parent_id) : undefined; return ({ id: r.id, parentId: r.parent_id, semanticId: `${r.node_type}:${r.node_key}`, parentSemanticId: parent ? `${parent.node_type}:${parent.node_key}` : null, type: r.node_type, key: r.node_key, displayName: r.display_name, sortOrder: r.sort_order, accessLevel: r.access_level }); }); };
async function managed(db: Knex, row: Row): Promise<ManagedPlatformWorkspace> { const contentNodes = await db<NodeRow>("platform_workspace_content_nodes").select("id", "workspace_id", "parent_id", "node_type", "node_key", "display_name", "sort_order", "access_level").where({ workspace_id: row.id }).orderBy("sort_order"); const { moduleKey: _moduleKey, ...workspace } = serialize(row); return { ...workspace, contentNodes: serializeNodes(contentNodes) }; }
async function nodes(tx: Knex.Transaction, id: string, sourceId?: string): Promise<void> {
  const source = sourceId ? await tx<NodeRow>("platform_workspace_content_nodes").select("*").where({ workspace_id: sourceId }) : [];
  if (!source.length) {
    const [page] = await tx("platform_workspace_content_nodes").insert({ workspace_id: id, node_type: "page", node_key: "workspace", display_name: "Workspace", sort_order: 0 }).returning(["id"]);
    const [tab] = await tx("platform_workspace_content_nodes").insert({ workspace_id: id, parent_id: page.id, node_type: "tab", node_key: "overview", display_name: "Overview", sort_order: 0 }).returning(["id"]);
    await tx("platform_workspace_content_nodes").insert({ workspace_id: id, parent_id: tab.id, node_type: "card", node_key: "content", display_name: "Content", sort_order: 0 });
    return;
  }
  const sourceById = new Map(source.map(node => [node.id, node])); const ids = new Map<string, string>();
  for (const node of source.sort((a, b) => ({ page: 0, tab: 1, card: 2 })[a.node_type] - ({ page: 0, tab: 1, card: 2 })[b.node_type] || a.sort_order - b.sort_order)) {
    const parent = node.parent_id ? sourceById.get(node.parent_id) : undefined;
    const parentId = parent ? ids.get(`${parent.node_type}:${parent.node_key}`) : null;
    if (parent && !parentId) throw new Error("The source platform workspace hierarchy is invalid.");
    const [created] = await tx("platform_workspace_content_nodes").insert({ workspace_id: id, parent_id: parentId, node_type: node.node_type, node_key: node.node_key, display_name: node.display_name, sort_order: node.sort_order, access_level: "active" }).returning("id");
    ids.set(`${node.node_type}:${node.node_key}`, created.id);
  }
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
    await tx.raw("select pg_advisory_xact_lock(hashtext(?))", ["bisby-platform-workspace"]); const rows = await tx<Row>("platform_workspaces").select("id", "workspace_key", "sort_order").orderBy("sort_order").forUpdate();
    const key = `pws-${Math.max(0, ...rows.map(r => Number(/^pws-(\d+)$/.exec(r.workspace_key)?.[1] ?? 0))) + 1}`;
    const [row] = await tx<Row>("platform_workspaces").insert({ workspace_key: key, display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, sort_order: Math.max(-1, ...rows.map(r => r.sort_order)) + 1 }).returning("*");
    await nodes(tx, row.id, rows[0]?.id); return managed(tx, row);
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

function assertParent(type: NodeRow["node_type"], parentType: NodeRow["node_type"] | null, parentKey: string | null): void {
  const expected = type === "page" ? null : type === "tab" ? "page" : "tab";
  if (parentType !== expected || (expected === null ? parentKey !== null : parentKey === null)) {
    throw new PlatformWorkspaceHierarchyError(
      "invalid_platform_workspace_hierarchy_parent",
      type === "page" ? "A page cannot have a parent." : `A ${type} must have a ${expected} parent.`,
    );
  }
}
async function hierarchyWorkspaces(tx: Knex.Transaction): Promise<Pick<Row, "id">[]> {
  await tx.raw("select pg_advisory_xact_lock(hashtext(?))", ["bisby-platform-workspace"]);
  return tx<Row>("platform_workspaces").select("id").forUpdate();
}
export async function addPlatformWorkspaceHierarchyNode(db: Knex, input: WorkspaceHierarchyInput) {
  assertParent(input.type, input.parentType, input.parentKey);
  return db.transaction(async tx => { const workspaces = await hierarchyWorkspaces(tx); if (!workspaces.length) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_node_not_found", "Create a platform workspace before adding hierarchy controls."); for (const workspace of workspaces) { if (await tx("platform_workspace_content_nodes").where({ workspace_id: workspace.id, node_type: input.type, node_key: input.key }).first()) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_key_conflict", "That semantic hierarchy key already exists."); const parent = input.parentType ? await tx<NodeRow>("platform_workspace_content_nodes").select("id").where({ workspace_id: workspace.id, node_type: input.parentType, node_key: input.parentKey! }).first() : null; if (input.parentType && !parent) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_node_not_found", "The semantic parent was not found in every platform workspace."); await tx("platform_workspace_content_nodes").insert({ workspace_id: workspace.id, parent_id: parent?.id ?? null, node_type: input.type, node_key: input.key, display_name: input.displayName, sort_order: input.sortOrder, access_level: "active" }); } return listPlatformWorkspaces(tx); });
}
export async function updatePlatformWorkspaceHierarchyNode(db: Knex, type: NodeRow["node_type"], key: string, input: Omit<WorkspaceHierarchyInput, "type">) {
  assertParent(type, input.parentType, input.parentKey);
  return db.transaction(async tx => { const workspaces = await hierarchyWorkspaces(tx); for (const workspace of workspaces) { const node = await tx<NodeRow>("platform_workspace_content_nodes").where({ workspace_id: workspace.id, node_type: type, node_key: key }).first(); if (!node) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_node_not_found", "The semantic hierarchy node was not found in every platform workspace."); if (key !== input.key && await tx("platform_workspace_content_nodes").where({ workspace_id: workspace.id, node_type: type, node_key: input.key }).first()) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_key_conflict", "That semantic hierarchy key already exists."); const parent = input.parentType ? await tx<NodeRow>("platform_workspace_content_nodes").select("id").where({ workspace_id: workspace.id, node_type: input.parentType, node_key: input.parentKey! }).first() : null; if (input.parentType && !parent) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_node_not_found", "The semantic parent was not found in every platform workspace."); await tx("platform_workspace_content_nodes").where({ id: node.id }).update({ parent_id: parent?.id ?? null, node_key: input.key, display_name: input.displayName, sort_order: input.sortOrder, updated_at: tx.fn.now() }); } return listPlatformWorkspaces(tx); });
}
export async function removePlatformWorkspaceHierarchyNode(db: Knex, type: NodeRow["node_type"], key: string) {
  return db.transaction(async tx => { const workspaces = await hierarchyWorkspaces(tx); for (const workspace of workspaces) if (await tx("platform_workspace_content_nodes").where({ workspace_id: workspace.id, node_type: type, node_key: key }).delete() !== 1) throw new PlatformWorkspaceHierarchyError("platform_workspace_hierarchy_node_not_found", "The semantic hierarchy node was not found in every platform workspace."); return listPlatformWorkspaces(tx); });
}