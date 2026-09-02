import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_staff_accounts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("username", 255).notNullable().unique();
    table.string("display_name", 255).notNullable();
    table.text("password_hash").notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.boolean("must_change_password").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("platform_staff_workspace_assignments", (table) => {
    table
      .uuid("platform_staff_id")
      .notNullable()
      .references("id")
      .inTable("platform_staff_accounts")
      .onDelete("CASCADE");
    table
      .string("workspace_key", 64)
      .notNullable()
      .references("workspace_key")
      .inTable("platform_workspaces")
      .onDelete("CASCADE");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(["platform_staff_id", "workspace_key"]);
    table.index(["workspace_key"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_staff_workspace_assignments");
  await knex.schema.dropTableIfExists("platform_staff_accounts");
}