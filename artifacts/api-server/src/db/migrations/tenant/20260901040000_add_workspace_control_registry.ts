import type { Knex } from "knex";

const CORE_SCHEMA = "core_admin";
const MODULE_SCHEMA_NAMES = [
  "module_a",
  "module_b",
  "module_c",
  "module_d",
  "module_e",
  "module_f",
  "module_g",
  "module_h",
] as const;
const WORKSPACE_KEYS = Array.from({ length: 10 }, (_, index) => `ws-${index + 1}`);

const CONTENT_NODES = [
  { node_type: "page", node_key: "workspace", display_name: "Workspace", parent_key: null, sort_order: 0 },
  { node_type: "tab", node_key: "overview", display_name: "Overview", parent_key: "page:workspace", sort_order: 0 },
  { node_type: "card", node_key: "destination-status", display_name: "Destination status", parent_key: "tab:overview", sort_order: 0 },
  { node_type: "card", node_key: "access-boundary", display_name: "Access boundary", parent_key: "tab:overview", sort_order: 1 },
  { node_type: "card", node_key: "session-status", display_name: "Session status", parent_key: "tab:overview", sort_order: 2 },
] as const;

function addAuditColumns(table: Knex.CreateTableBuilder, knex: Knex): void {
  table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CORE_SCHEMA).createTable("module_workspaces", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("module_schema", 63).notNullable();
    table.string("workspace_key", 64).notNullable();
    table.string("display_name", 255).notNullable();
    table.integer("sort_order").notNullable().defaultTo(0);
    table.boolean("is_active").notNullable().defaultTo(true);
    addAuditColumns(table, knex);
    table.unique(["module_schema", "workspace_key"]);
    table.index(["module_schema", "is_active", "sort_order"]);
  });

  await knex.schema.withSchema(CORE_SCHEMA).createTable("workspace_content_nodes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("workspace_id")
      .notNullable()
      .references("id")
      .inTable(`${CORE_SCHEMA}.module_workspaces`)
      .onDelete("CASCADE");
    table.uuid("parent_id").references("id").inTable(`${CORE_SCHEMA}.workspace_content_nodes`).onDelete("CASCADE");
    table.string("module_schema", 63).notNullable();
    table.string("node_type", 16).notNullable();
    table.string("node_key", 127).notNullable();
    table.string("display_name", 255).notNullable();
    table.integer("sort_order").notNullable().defaultTo(0);
    table.string("access_level", 32).notNullable().defaultTo("active");
    addAuditColumns(table, knex);
    table.unique(["workspace_id", "node_type", "node_key"]);
    table.index(["workspace_id", "parent_id", "sort_order"]);
  });

  await knex.schema.withSchema(CORE_SCHEMA).alterTable("tab_permissions", (table) => {
    table.string("workspace_key", 64).notNullable().alter();
  });

  for (const moduleSchema of MODULE_SCHEMA_NAMES) {
    for (const [index, workspaceKey] of WORKSPACE_KEYS.entries()) {
      const [workspace] = await knex("core_admin.module_workspaces")
        .insert({
          module_schema: moduleSchema,
          workspace_key: workspaceKey,
          display_name: index === 0 ? "Dashboard" : `Workspace ${index + 1}`,
          sort_order: index,
          is_active: true,
        })
        .returning(["id"]);
      if (!workspace) {
        throw new Error(`Could not seed ${moduleSchema}/${workspaceKey}.`);
      }

      const parentIds = new Map<string, string>();
      for (const node of CONTENT_NODES) {
        const parentId = node.parent_key ? parentIds.get(node.parent_key) : undefined;
        const [created] = await knex("core_admin.workspace_content_nodes")
          .insert({
            workspace_id: workspace.id,
            parent_id: parentId ?? null,
            module_schema: moduleSchema,
            node_type: node.node_type,
            node_key: node.node_key,
            display_name: node.display_name,
            sort_order: node.sort_order,
            access_level: "active",
          })
          .returning(["id"]);
        if (!created) {
          throw new Error(`Could not seed content controls for ${moduleSchema}/${workspaceKey}.`);
        }
        parentIds.set(`${node.node_type}:${node.node_key}`, created.id);
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("workspace_content_nodes");
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("module_workspaces");
}