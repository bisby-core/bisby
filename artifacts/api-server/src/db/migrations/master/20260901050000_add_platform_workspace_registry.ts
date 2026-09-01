import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_workspaces", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("workspace_key", 64).notNullable().unique();
    table.string("display_name", 255).notNullable();
    table.string("workspace_type", 32).notNullable().defaultTo("normal");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.boolean("public_visible").notNullable().defaultTo(false);
    table.boolean("contact_enabled").notNullable().defaultTo(false);
    table.integer("sort_order").notNullable().defaultTo(0);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("workspace_type in ('normal', 'public_information', 'contact_us')");
    table.check("(workspace_type <> 'normal' or (not public_visible and not contact_enabled))");
    table.check("(workspace_type <> 'public_information' or not contact_enabled)");
  });
  await knex.schema.createTable("platform_workspace_content_nodes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("workspace_id").notNullable().references("id").inTable("platform_workspaces").onDelete("CASCADE");
    table.uuid("parent_id").references("id").inTable("platform_workspace_content_nodes").onDelete("CASCADE");
    table.string("node_type", 16).notNullable(); table.string("node_key", 127).notNullable();
    table.string("display_name", 255).notNullable(); table.integer("sort_order").notNullable().defaultTo(0);
    table.string("access_level", 32).notNullable().defaultTo("active");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("node_type in ('page', 'tab', 'card')");
    table.check("access_level in ('active', 'sign_only', 'view_only', 'not_available')");
    table.unique(["workspace_id", "node_type", "node_key"]);
  });
  for (const [index, seed] of ["Public Information", "Contact Us"].entries()) {
    const [workspace] = await knex("platform_workspaces").insert({
      workspace_key: `pws-${index + 1}`, display_name: seed,
      workspace_type: index === 0 ? "public_information" : "contact_us",
      is_active: true, public_visible: true, contact_enabled: index === 1, sort_order: index,
    }).returning(["id"]);
    const [page] = await knex("platform_workspace_content_nodes").insert({ workspace_id: workspace.id, node_type: "page", node_key: "workspace", display_name: "Workspace", sort_order: 0 }).returning(["id"]);
    const [tab] = await knex("platform_workspace_content_nodes").insert({ workspace_id: workspace.id, parent_id: page.id, node_type: "tab", node_key: "overview", display_name: "Overview", sort_order: 0 }).returning(["id"]);
    await knex("platform_workspace_content_nodes").insert({ workspace_id: workspace.id, parent_id: tab.id, node_type: "card", node_key: "content", display_name: "Content", sort_order: 0 });
  }
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_workspace_content_nodes");
  await knex.schema.dropTableIfExists("platform_workspaces");
}