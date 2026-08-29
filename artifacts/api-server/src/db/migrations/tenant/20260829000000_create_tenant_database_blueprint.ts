import type { Knex } from "knex";

const TENANT_MODULE_SCHEMAS = [
  "module_a",
  "module_b",
  "module_c",
  "module_d",
  "module_e",
  "module_f",
  "module_g",
  "module_h",
] as const;

const CORE_SCHEMA = "core_admin";

function addAuditColumns(table: Knex.CreateTableBuilder, knex: Knex): void {
  table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw('create extension if not exists "pgcrypto"');
  await knex.raw(`create schema if not exists "${CORE_SCHEMA}"`);
  for (const schemaName of TENANT_MODULE_SCHEMAS) {
    await knex.raw(`create schema if not exists "${schemaName}"`);
  }

  await knex.schema.withSchema(CORE_SCHEMA).createTable("client_accounts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("username", 255).notNullable().unique();
    table.string("display_name", 255).notNullable();
    table.text("password_hash").notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    addAuditColumns(table, knex);
  });

  await knex.schema.withSchema(CORE_SCHEMA).createTable("tab_permissions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("client_account_id")
      .notNullable()
      .references("id")
      .inTable(`${CORE_SCHEMA}.client_accounts`)
      .onDelete("CASCADE");
    table.string("module_schema", 63).notNullable();
    table.string("tab_key", 127).notNullable();
    table.boolean("can_view").notNullable().defaultTo(false);
    table.boolean("can_edit").notNullable().defaultTo(false);
    table.unique(["client_account_id", "module_schema", "tab_key"]);
    addAuditColumns(table, knex);
  });

  for (const schemaName of TENANT_MODULE_SCHEMAS) {
    await knex.schema.withSchema(schemaName).createTable("visitor_submissions", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.string("visitor_email", 320);
      table.jsonb("payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      table.string("status", 32).notNullable().defaultTo("received");
      table.timestamp("submitted_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      addAuditColumns(table, knex);
      table.index(["status"]);
      table.index(["submitted_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const schemaName of [...TENANT_MODULE_SCHEMAS].reverse()) {
    await knex.schema.withSchema(schemaName).dropTableIfExists("visitor_submissions");
    await knex.raw(`drop schema if exists "${schemaName}"`);
  }

  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("tab_permissions");
  await knex.schema.withSchema(CORE_SCHEMA).dropTableIfExists("client_accounts");
  await knex.raw(`drop schema if exists "${CORE_SCHEMA}"`);
}