import type { Knex } from "knex";

const TABLE = "core_admin.tenant_admin_staff_workspace_content_nodes";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("core_admin").alterTable("tenant_admin_staff_workspaces", (table) => {
    table.string("workspace_type", 32).notNullable().defaultTo("normal");
    table.boolean("public_visible").notNullable().defaultTo(false);
    table.boolean("contact_enabled").notNullable().defaultTo(false);
  });
  await knex.schema.withSchema("core_admin").createTable("tenant_admin_staff_workspace_content_nodes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("workspace_id").notNullable().references("id").inTable("core_admin.tenant_admin_staff_workspaces").onDelete("CASCADE");
    table.uuid("parent_id").references("id").inTable(TABLE).onDelete("CASCADE");
    table.string("node_type", 16).notNullable();
    table.string("node_key", 127).notNullable();
    table.string("display_name", 255).notNullable();
    table.integer("sort_order").notNullable().defaultTo(0);
    table.string("access_level", 32).notNullable().defaultTo("active");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("node_type in ('page', 'tab', 'card')");
    table.check("access_level in ('active', 'sign_only', 'view_only', 'not_available')");
    table.unique(["workspace_id", "node_type", "node_key"]);
  });

  const workspaces = await knex<{ id: string }>("core_admin.tenant_admin_staff_workspaces").select("id");
  for (const workspace of workspaces) {
    const [page] = await knex(TABLE).insert({ workspace_id: workspace.id, node_type: "page", node_key: "workspace", display_name: "Workspace", sort_order: 0 }).returning("id");
    const [tab] = await knex(TABLE).insert({ workspace_id: workspace.id, parent_id: page.id, node_type: "tab", node_key: "overview", display_name: "Overview", sort_order: 0 }).returning("id");
    await knex(TABLE).insert([
      { workspace_id: workspace.id, parent_id: tab.id, node_type: "card", node_key: "content", display_name: "Content", sort_order: 0 },
      { workspace_id: workspace.id, parent_id: tab.id, node_type: "card", node_key: "access-boundary", display_name: "Access boundary", sort_order: 1 },
      { workspace_id: workspace.id, parent_id: tab.id, node_type: "card", node_key: "session-status", display_name: "Session status", sort_order: 2 },
    ]);
  }
}

export async function down(): Promise<void> {
  throw new Error(
    "This migration is forward-only because rolling it back would destroy tenant-authored workspace content.",
  );
}