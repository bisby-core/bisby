import type { Knex } from "knex";
import { hashPassword } from "../auth/password";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import { TenantAdministrationError } from "./accounts";
import { normalizedMetadata, type WorkspaceAccessLevel, type WorkspaceMetadata } from "./public-workspaces";
import type { WorkspaceHierarchyInput } from "./workspaces";

type WorkspaceRow = { id: string; workspace_key: string; display_name: string; workspace_type: WorkspaceMetadata["workspaceType"]; is_active: boolean; public_visible: boolean; contact_enabled: boolean; sort_order: number; created_at: Date | string; updated_at?: Date | string };
type NodeRow = { id: string; workspace_id: string; parent_id: string | null; node_type: "page" | "tab" | "card"; node_key: string; display_name: string; sort_order: number; access_level: WorkspaceAccessLevel };
type AccountRow = { id: string; username: string; display_name: string; password_hash?: string; account_type?: string; module_key?: string | null; is_active: boolean; must_change_password: boolean; created_at: Date | string };
const NODE_TABLE = "core_admin.tenant_admin_staff_workspace_content_nodes";
const DEFAULT_NODES = [
  { type: "page", key: "workspace", displayName: "Workspace", parentSemanticId: null, sortOrder: 0 },
  { type: "tab", key: "overview", displayName: "Overview", parentSemanticId: "page:workspace", sortOrder: 0 },
  { type: "card", key: "content", displayName: "Content", parentSemanticId: "tab:overview", sortOrder: 0 },
  { type: "card", key: "access-boundary", displayName: "Access boundary", parentSemanticId: "tab:overview", sortOrder: 1 },
  { type: "card", key: "session-status", displayName: "Session status", parentSemanticId: "tab:overview", sortOrder: 2 },
] as const;

function assertAdmin(actor: AuthenticatedLocalUser): void {
  if (actor.role !== "tenant_admin") throw new TenantAdministrationError("administration_forbidden", "Only a tenant admin can manage tenant admin staff.");
}
async function recordTenantAdminStaffAudit(tx: Knex.Transaction, actor: AuthenticatedLocalUser, eventType: string, details: Record<string, unknown>, targetAccountId = actor.accountId): Promise<void> {
  await tx("core_admin.administration_audit_log").insert({ event_type: eventType, actor_account_id: actor.accountId, actor_username: actor.username, target_account_id: targetAccountId, details });
}
async function assignedWorkspaceKeys(tx: Knex.Transaction, accountId: string): Promise<string[]> {
  const rows = await tx<{ workspace_key: string }>("core_admin.tenant_admin_staff_workspace_assignments").select("workspace_key").where("account_id", accountId);
  return rows.map(row => row.workspace_key).sort();
}
function hierarchyParent(type: NodeRow["node_type"], parentType: NodeRow["node_type"] | null, parentKey: string | null): void {
  const expected = type === "page" ? null : type === "tab" ? "page" : "tab";
  if (parentType !== expected || (expected === null ? parentKey !== null : parentKey === null)) throw new TenantAdministrationError("invalid_workspace_hierarchy", type === "page" ? "A page cannot have a parent." : `A ${type} must have a ${expected} parent.`);
}
function serialize(row: WorkspaceRow, allNodes: readonly NodeRow[]) {
  const rows = allNodes.filter(node => node.workspace_id === row.id);
  const byId = new Map(rows.map(node => [node.id, node]));
  return {
    id: row.id, workspaceKey: row.workspace_key, displayName: row.display_name, workspaceType: row.workspace_type,
    isActive: row.is_active, publicVisible: row.public_visible, contactEnabled: row.contact_enabled,
    sortOrder: row.sort_order, createdAt: new Date(row.created_at).toISOString(),
    contentNodes: rows.sort((a, b) => ({ page: 0, tab: 1, card: 2 })[a.node_type] - ({ page: 0, tab: 1, card: 2 })[b.node_type] || a.sort_order - b.sort_order).map(node => {
      const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
      return { id: node.id, parentId: node.parent_id, semanticId: `${node.node_type}:${node.node_key}`, parentSemanticId: parent ? `${parent.node_type}:${parent.node_key}` : null, type: node.node_type, key: node.node_key, displayName: node.display_name, sortOrder: node.sort_order, accessLevel: node.access_level };
    }),
  };
}
async function snapshot(db: Knex) {
  const workspaces = await db<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").select("*").orderBy(["sort_order", "workspace_key"]);
  const ids = workspaces.map(row => row.id);
  const nodes = ids.length ? await db<NodeRow>(NODE_TABLE).select("*").whereIn("workspace_id", ids) : [];
  return workspaces.map(row => serialize(row, nodes));
}
async function validKeys(db: Knex, keys: readonly string[]): Promise<string[]> {
  const rows = await db<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").select("workspace_key").whereIn("workspace_key", [...new Set(keys)]).andWhere("is_active", true);
  const result = rows.map(row => row.workspace_key).sort();
  if (!result.length || result.length !== new Set(keys).size) throw new TenantAdministrationError("invalid_account_assignment", "Assign at least one active Tenant Admin Staff Workspace.");
  return result;
}
async function insertHierarchy(tx: Knex.Transaction, workspaceId: string, source: readonly { type: NodeRow["node_type"]; key: string; displayName: string; parentSemanticId: string | null; sortOrder: number }[]): Promise<NodeRow[]> {
  const ids = new Map<string, string>(); const created: NodeRow[] = [];
  for (const node of [...source].sort((a, b) => ({ page: 0, tab: 1, card: 2 })[a.type] - ({ page: 0, tab: 1, card: 2 })[b.type] || a.sortOrder - b.sortOrder)) {
    const parentId = node.parentSemanticId ? ids.get(node.parentSemanticId) : null;
    if (node.parentSemanticId && !parentId) throw new TenantAdministrationError("invalid_workspace_hierarchy", "The source workspace hierarchy is invalid.");
    const [row] = await tx<NodeRow>(NODE_TABLE).insert({ workspace_id: workspaceId, parent_id: parentId, node_type: node.type, node_key: node.key, display_name: node.displayName, sort_order: node.sortOrder, access_level: "active" }).returning("*");
    ids.set(`${node.type}:${node.key}`, row.id); created.push(row);
  }
  return created;
}

export async function listTenantAdminStaffSnapshot(db: Knex, actor: AuthenticatedLocalUser) {
  assertAdmin(actor);
  const [workspaces, accounts] = await Promise.all([snapshot(db), db<AccountRow>("core_admin.client_accounts").select("id", "username", "display_name", "is_active", "must_change_password", "created_at").where("account_type", "tenant_admin_staff").orderBy("username")]);
  const ids = accounts.map(account => account.id);
  const assignments = ids.length ? await db<{ account_id: string; workspace_key: string }>("core_admin.tenant_admin_staff_workspace_assignments").select("account_id", "workspace_key").whereIn("account_id", ids) : [];
  return { workspaces, staff: accounts.map(a => ({ id: a.id, username: a.username, displayName: a.display_name, isActive: a.is_active, requiresPasswordChange: a.must_change_password, createdAt: new Date(a.created_at).toISOString(), workspaceKeys: assignments.filter(x => x.account_id === a.id).map(x => x.workspace_key).sort() })) };
}
export async function createTenantAdminStaff(db: Knex, actor: AuthenticatedLocalUser, input: { username: string; displayName: string; temporaryPassword: string; workspaceKeys: string[] }) {
  assertAdmin(actor); const passwordHash = await hashPassword(input.temporaryPassword);
  return db.transaction(async tx => {
    const workspaceKeys = await validKeys(tx, input.workspaceKeys);
    try {
      const [account] = await tx<AccountRow>("core_admin.client_accounts").insert({ username: input.username, display_name: input.displayName, password_hash: passwordHash, account_type: "tenant_admin_staff", module_key: null, is_active: true, must_change_password: true }).returning(["id", "username", "display_name", "is_active", "must_change_password", "created_at"]);
      await tx("core_admin.tenant_admin_staff_workspace_assignments").insert(workspaceKeys.map(workspace_key => ({ account_id: account.id, workspace_key })));
       await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff.created", { username: account.username, role: "tenant_admin_staff", workspaceKeys }, account.id);
      return { id: account.id, username: account.username, displayName: account.display_name, isActive: account.is_active, requiresPasswordChange: account.must_change_password, createdAt: new Date(account.created_at).toISOString(), workspaceKeys };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new TenantAdministrationError("managed_account_conflict", "That username is already in use in this tenant.");
      throw error;
    }
  });
}
async function account(db: Knex, actor: AuthenticatedLocalUser, id: string) { assertAdmin(actor); const value = await db<AccountRow>("core_admin.client_accounts").where("id", id).andWhere("account_type", "tenant_admin_staff").first(); if (!value) throw new TenantAdministrationError("managed_account_not_found", "That tenant admin staff account was not found."); return value; }
export async function updateTenantAdminStaffAssignments(db: Knex, actor: AuthenticatedLocalUser, id: string, workspaceKeys: string[]) { assertAdmin(actor); return db.transaction(async tx => { const staff = await account(tx, actor, id); const previousWorkspaceKeys = await assignedWorkspaceKeys(tx, id); const keys = await validKeys(tx, workspaceKeys); await tx("core_admin.tenant_admin_staff_workspace_assignments").where({ account_id: id }).delete(); await tx("core_admin.tenant_admin_staff_workspace_assignments").insert(keys.map(workspace_key => ({ account_id: id, workspace_key }))); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff.assignments_updated", { username: staff.username, role: "tenant_admin_staff", previousWorkspaceKeys, workspaceKeys: keys }, id); return { accountId: id, workspaceKeys: keys }; }); }
export async function updateTenantAdminStaffStatus(db: Knex, actor: AuthenticatedLocalUser, id: string, active: boolean) { assertAdmin(actor); return db.transaction(async tx => { const staff = await account(tx, actor, id); await tx("core_admin.client_accounts").where({ id }).update({ is_active: active, updated_at: tx.fn.now() }); await recordTenantAdminStaffAudit(tx, actor, active ? "tenant.tenant_admin_staff.activated" : "tenant.tenant_admin_staff.deactivated", { username: staff.username, role: "tenant_admin_staff", active }, id); return { accountId: id, active }; }); }
export async function deleteTenantAdminStaff(db: Knex, actor: AuthenticatedLocalUser, id: string) { assertAdmin(actor); return db.transaction(async tx => { const staff = await account(tx, actor, id); const workspaceKeys = await assignedWorkspaceKeys(tx, id); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff.deleted", { username: staff.username, displayName: staff.display_name, role: "tenant_admin_staff", isActive: staff.is_active, workspaceKeys }, id); const deleted = await tx("core_admin.client_accounts").where({ id, account_type: "tenant_admin_staff" }).delete(); if (deleted !== 1) throw new TenantAdministrationError("managed_account_not_found", "That tenant admin staff account was not found."); return { accountId: id, deleted: true as const }; }); }
export async function resetTenantAdminStaffPassword(db: Knex, actor: AuthenticatedLocalUser, id: string, temporaryPassword: string) { await account(db, actor, id); await db("core_admin.client_accounts").where({ id, is_active: true }).update({ password_hash: await hashPassword(temporaryPassword), must_change_password: true, updated_at: db.fn.now() }); return { status: "password_reset" as const, accountId: id }; }
export async function createTenantAdminStaffWorkspace(db: Knex, actor: AuthenticatedLocalUser, input: WorkspaceMetadata) {
  assertAdmin(actor); const metadata = normalizedMetadata(input);
  return db.transaction(async tx => { await tx.raw("select pg_advisory_xact_lock(hashtext(?))", ["bisby-tenant-admin-staff-workspace"]); const existing = await tx<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").select("*").orderBy("sort_order").forUpdate(); const next = Math.max(0, ...existing.map(w => Number(/^tasw-(\d+)$/.exec(w.workspace_key)?.[1] ?? 0))) + 1; const [row] = await tx<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").insert({ workspace_key: `tasw-${next}`, display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, sort_order: Math.max(-1, ...existing.map(w => w.sort_order)) + 1 }).returning("*"); let source = DEFAULT_NODES as readonly { type: NodeRow["node_type"]; key: string; displayName: string; parentSemanticId: string | null; sortOrder: number }[]; if (existing[0]) { const rows = await tx<NodeRow>(NODE_TABLE).select("*").where({ workspace_id: existing[0].id }); if (rows.length) { const byId = new Map(rows.map(n => [n.id, n])); source = rows.map(n => ({ type: n.node_type, key: n.node_key, displayName: n.display_name, parentSemanticId: n.parent_id ? (() => { const p = byId.get(n.parent_id); return p ? `${p.node_type}:${p.node_key}` : null; })() : null, sortOrder: n.sort_order })); } } const result = serialize(row, await insertHierarchy(tx, row.id, source)); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.created", { workspaceKey: row.workspace_key, metadata }); return result; });
}
export async function updateTenantAdminStaffWorkspace(db: Knex, actor: AuthenticatedLocalUser, key: string, input: WorkspaceMetadata) { assertAdmin(actor); const metadata = normalizedMetadata(input); return db.transaction(async tx => { const [row] = await tx<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").where({ workspace_key: key }).update({ display_name: metadata.displayName, workspace_type: metadata.workspaceType, is_active: metadata.isActive, public_visible: metadata.publicVisible, contact_enabled: metadata.contactEnabled, updated_at: tx.fn.now() }).returning("*"); if (!row) throw new TenantAdministrationError("managed_account_not_found", "That Tenant Admin Staff Workspace was not found."); const nodes = await tx<NodeRow>(NODE_TABLE).select("*").where({ workspace_id: row.id }); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.updated", { workspaceKey: key, metadata }); return serialize(row, nodes); }); }
export async function updateTenantAdminStaffWorkspaceAccess(db: Knex, actor: AuthenticatedLocalUser, key: string, controls: readonly { nodeId: string; accessLevel: WorkspaceAccessLevel }[]) { assertAdmin(actor); return db.transaction(async tx => { const workspace = await tx<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").where({ workspace_key: key }).forUpdate().first(); if (!workspace) throw new TenantAdministrationError("managed_account_not_found", "That Tenant Admin Staff Workspace was not found."); const ids = [...new Set(controls.map(c => c.nodeId))]; const found = await tx<NodeRow>(NODE_TABLE).select("id").where({ workspace_id: workspace.id }).whereIn("id", ids).forUpdate(); if (found.length !== ids.length) throw new TenantAdministrationError("managed_account_not_found", "One or more workspace controls were not found."); for (const control of controls) await tx(NODE_TABLE).where({ workspace_id: workspace.id, id: control.nodeId }).update({ access_level: control.accessLevel, updated_at: tx.fn.now() }); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.access_updated", { workspaceKey: key, controls }); return serialize(workspace, await tx<NodeRow>(NODE_TABLE).select("*").where({ workspace_id: workspace.id })); }); }
async function hierarchyWorkspaces(tx: Knex.Transaction) { await tx.raw("select pg_advisory_xact_lock(hashtext(?))", ["bisby-tenant-admin-staff-workspace"]); return tx<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").select("id").forUpdate(); }
export async function addTenantAdminStaffWorkspaceHierarchyNode(db: Knex, actor: AuthenticatedLocalUser, input: WorkspaceHierarchyInput) { assertAdmin(actor); hierarchyParent(input.type, input.parentType, input.parentKey); return db.transaction(async tx => { const workspaces = await hierarchyWorkspaces(tx); if (!workspaces.length) throw new TenantAdministrationError("managed_account_conflict", "Create a workspace before adding hierarchy controls."); for (const workspace of workspaces) { const duplicate = await tx(NODE_TABLE).where({ workspace_id: workspace.id, node_type: input.type, node_key: input.key }).first(); if (duplicate) throw new TenantAdministrationError("managed_account_conflict", "That semantic hierarchy key already exists."); const parent = input.parentType ? await tx<NodeRow>(NODE_TABLE).select("id").where({ workspace_id: workspace.id, node_type: input.parentType, node_key: input.parentKey! }).first() : null; if (input.parentType && !parent) throw new TenantAdministrationError("managed_account_not_found", "The semantic parent was not found in every workspace."); await tx(NODE_TABLE).insert({ workspace_id: workspace.id, parent_id: parent?.id ?? null, node_type: input.type, node_key: input.key, display_name: input.displayName, sort_order: input.sortOrder, access_level: "active" }); } await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.hierarchy_added", { node: input }); return { workspaces: await snapshot(tx) }; }); }
export async function updateTenantAdminStaffWorkspaceHierarchyNode(db: Knex, actor: AuthenticatedLocalUser, type: NodeRow["node_type"], key: string, input: Omit<WorkspaceHierarchyInput, "type">) { assertAdmin(actor); hierarchyParent(type, input.parentType, input.parentKey); return db.transaction(async tx => { const workspaces = await hierarchyWorkspaces(tx); for (const workspace of workspaces) { const node = await tx<NodeRow>(NODE_TABLE).where({ workspace_id: workspace.id, node_type: type, node_key: key }).first(); if (!node) throw new TenantAdministrationError("managed_account_not_found", "The semantic hierarchy node was not found in every workspace."); const duplicate = key !== input.key ? await tx(NODE_TABLE).where({ workspace_id: workspace.id, node_type: type, node_key: input.key }).first() : null; if (duplicate) throw new TenantAdministrationError("managed_account_conflict", "That semantic hierarchy key already exists."); const parent = input.parentType ? await tx<NodeRow>(NODE_TABLE).select("id").where({ workspace_id: workspace.id, node_type: input.parentType, node_key: input.parentKey! }).first() : null; if (input.parentType && !parent) throw new TenantAdministrationError("managed_account_not_found", "The semantic parent was not found in every workspace."); await tx(NODE_TABLE).where({ id: node.id }).update({ parent_id: parent?.id ?? null, node_key: input.key, display_name: input.displayName, sort_order: input.sortOrder, updated_at: tx.fn.now() }); } await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.hierarchy_updated", { nodeType: type, nodeKey: key, update: input }); return { workspaces: await snapshot(tx) }; }); }
export async function removeTenantAdminStaffWorkspaceHierarchyNode(db: Knex, actor: AuthenticatedLocalUser, type: NodeRow["node_type"], key: string) { assertAdmin(actor); return db.transaction(async tx => { const workspaces = await hierarchyWorkspaces(tx); for (const workspace of workspaces) if (await tx(NODE_TABLE).where({ workspace_id: workspace.id, node_type: type, node_key: key }).delete() !== 1) throw new TenantAdministrationError("managed_account_not_found", "The semantic hierarchy node was not found in every workspace."); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.hierarchy_removed", { nodeType: type, nodeKey: key }); return { workspaces: await snapshot(tx) }; }); }
export async function removeTenantAdminStaffWorkspace(db: Knex, actor: AuthenticatedLocalUser, key: string) { assertAdmin(actor); return db.transaction(async tx => { const workspace = await tx<WorkspaceRow>("core_admin.tenant_admin_staff_workspaces").where({ workspace_key: key }).forUpdate().first(); if (!workspace) throw new TenantAdministrationError("managed_account_not_found", "That Tenant Admin Staff Workspace was not found."); const count = await tx("core_admin.tenant_admin_staff_workspaces").where({ id: workspace.id }).delete(); if (count !== 1) throw new TenantAdministrationError("managed_account_not_found", "That Tenant Admin Staff Workspace was not found."); await recordTenantAdminStaffAudit(tx, actor, "tenant.tenant_admin_staff_workspace.removed", { workspaceKey: key, displayName: workspace.display_name }); return { workspaceKey: key, removed: true }; }); }
export async function tenantAdminStaffRouteAccess(db: Knex, actor: AuthenticatedLocalUser, key: string) { if (actor.role !== "tenant_admin_staff") return false; return Boolean(await db("core_admin.tenant_admin_staff_workspaces as w").join("core_admin.tenant_admin_staff_workspace_assignments as a", "a.workspace_key", "w.workspace_key").where({ "a.account_id": actor.accountId, "w.workspace_key": key, "w.is_active": true }).first()); }