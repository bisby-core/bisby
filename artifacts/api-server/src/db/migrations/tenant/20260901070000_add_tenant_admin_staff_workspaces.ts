import type { Knex } from "knex";

const CORE_SCHEMA = "core_admin";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CORE_SCHEMA).createTable("tenant_admin_staff_workspaces", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("workspace_key", 64).notNullable().unique();
    table.string("display_name", 255).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.integer("sort_order").notNullable().defaultTo(0);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.withSchema(CORE_SCHEMA).createTable("tenant_admin_staff_workspace_assignments", (table) => {
    table.uuid("account_id").notNullable().references("id").inTable(`${CORE_SCHEMA}.client_accounts`).onDelete("CASCADE");
    table.string("workspace_key", 64).notNullable().references("workspace_key").inTable(`${CORE_SCHEMA}.tenant_admin_staff_workspaces`).onDelete("CASCADE");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(["account_id", "workspace_key"]);
    table.index(["workspace_key"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("tenant_admin_staff_workspace_assignments");
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("tenant_admin_staff_workspaces");
}