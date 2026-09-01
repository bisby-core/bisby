import type { Knex } from "knex";

const CORE_SCHEMA = "core_admin";
const MODULES = ["module_a", "module_b", "module_c", "module_d", "module_e", "module_f", "module_g", "module_h"];
const SEEDED = [
  { workspace_key: "tws-1", display_name: "Public Information", workspace_type: "public_information" },
  { workspace_key: "tws-2", display_name: "Contact Us", workspace_type: "contact_us" },
] as const;

async function seedNodes(knex: Knex, table: string, workspaceId: string, moduleSchema?: string): Promise<void> {
  const module = moduleSchema ? { module_schema: moduleSchema } : {};
  const [page] = await knex(table).insert({ workspace_id: workspaceId, ...module, node_type: "page", node_key: "workspace", display_name: "Workspace", sort_order: 0 }).returning(["id"]);
  const [tab] = await knex(table).insert({ workspace_id: workspaceId, ...module, parent_id: page.id, node_type: "tab", node_key: "overview", display_name: "Overview", sort_order: 0 }).returning(["id"]);
  await knex(table).insert({ workspace_id: workspaceId, ...module, parent_id: tab.id, node_type: "card", node_key: "content", display_name: "Content", sort_order: 0 });
}

function registryTable(knex: Knex, name: string): Promise<void> {
  return knex.schema.withSchema(CORE_SCHEMA).createTable(name, (table) => {
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
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CORE_SCHEMA).alterTable("module_workspaces", (table) => {
    table.string("workspace_type", 32).notNullable().defaultTo("normal");
    table.boolean("public_visible").notNullable().defaultTo(false);
    table.boolean("contact_enabled").notNullable().defaultTo(false);
  });
  await knex.raw(`alter table ${CORE_SCHEMA}.module_workspaces add constraint module_workspaces_type_check check (workspace_type in ('normal', 'public_information', 'contact_us'))`);
  await knex.raw(`alter table ${CORE_SCHEMA}.module_workspaces add constraint module_workspaces_visibility_check check ((workspace_type <> 'normal' or (not public_visible and not contact_enabled)) and (workspace_type <> 'public_information' or not contact_enabled))`);
  await registryTable(knex, "tenant_workspaces");
  await knex.schema.withSchema(CORE_SCHEMA).createTable("tenant_workspace_content_nodes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("workspace_id").notNullable().references("id").inTable(`${CORE_SCHEMA}.tenant_workspaces`).onDelete("CASCADE");
    table.uuid("parent_id").references("id").inTable(`${CORE_SCHEMA}.tenant_workspace_content_nodes`).onDelete("CASCADE");
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
  for (const seed of SEEDED) {
    const [workspace] = await knex("core_admin.tenant_workspaces").insert({
      ...seed, is_active: true, public_visible: true, contact_enabled: seed.workspace_type === "contact_us", sort_order: seed.workspace_key === "tws-1" ? 0 : 1,
    }).returning(["id"]);
    await seedNodes(knex, "core_admin.tenant_workspace_content_nodes", workspace.id);
  }
  for (const moduleSchema of MODULES) {
    for (const [index, seed] of SEEDED.entries()) {
      const [workspace] = await knex("core_admin.module_workspaces").insert({
        module_schema: moduleSchema, workspace_key: `ws-${101 + index}`, display_name: seed.display_name,
        workspace_type: seed.workspace_type, is_active: true, public_visible: true,
        contact_enabled: seed.workspace_type === "contact_us", sort_order: 100 + index,
      }).returning(["id"]);
      await seedNodes(knex, "core_admin.workspace_content_nodes", workspace.id, moduleSchema);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("tenant_workspace_content_nodes");
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("tenant_workspaces");
  await knex.raw(`alter table ${CORE_SCHEMA}.module_workspaces drop constraint if exists module_workspaces_visibility_check`);
  await knex.raw(`alter table ${CORE_SCHEMA}.module_workspaces drop constraint if exists module_workspaces_type_check`);
  await knex.schema.withSchema(CORE_SCHEMA).alterTable("module_workspaces", (table) => {
    table.dropColumns("workspace_type", "public_visible", "contact_enabled");
  });
}