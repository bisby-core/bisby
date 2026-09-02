import type { Knex } from "knex";

const WORKSPACE_TABLE = "core_admin.tenant_admin_staff_workspaces";
const NODE_TABLE = "core_admin.tenant_admin_staff_workspace_content_nodes";
const DEFAULT_WORKSPACE_COUNT = 10;

export async function up(knex: Knex): Promise<void> {
  const [{ count }] = await knex(WORKSPACE_TABLE).count<{ count: string }[]>({ count: "id" });
  if (Number(count) > 0) {
    return;
  }

  for (let index = 1; index <= DEFAULT_WORKSPACE_COUNT; index += 1) {
    const [workspace] = await knex(WORKSPACE_TABLE)
      .insert({
        workspace_key: `tasw-${index}`,
        display_name: `Workspace ${index}`,
        workspace_type: "normal",
        is_active: true,
        public_visible: false,
        contact_enabled: false,
        sort_order: index - 1,
      })
      .returning<{ id: string }[]>("id");

    const [page] = await knex(NODE_TABLE)
      .insert({
        workspace_id: workspace.id,
        node_type: "page",
        node_key: "workspace",
        display_name: "Workspace",
        sort_order: 0,
        access_level: "active",
      })
      .returning<{ id: string }[]>("id");

    const [tab] = await knex(NODE_TABLE)
      .insert({
        workspace_id: workspace.id,
        parent_id: page.id,
        node_type: "tab",
        node_key: "overview",
        display_name: "Overview",
        sort_order: 0,
        access_level: "active",
      })
      .returning<{ id: string }[]>("id");

    await knex(NODE_TABLE).insert([
      {
        workspace_id: workspace.id,
        parent_id: tab.id,
        node_type: "card",
        node_key: "content",
        display_name: "Content",
        sort_order: 0,
        access_level: "active",
      },
      {
        workspace_id: workspace.id,
        parent_id: tab.id,
        node_type: "card",
        node_key: "access-boundary",
        display_name: "Access boundary",
        sort_order: 1,
        access_level: "active",
      },
      {
        workspace_id: workspace.id,
        parent_id: tab.id,
        node_type: "card",
        node_key: "session-status",
        display_name: "Session status",
        sort_order: 2,
        access_level: "active",
      },
    ]);
  }
}

export async function down(): Promise<void> {
  // Keep user-editable workspace records intact during rollback.
}