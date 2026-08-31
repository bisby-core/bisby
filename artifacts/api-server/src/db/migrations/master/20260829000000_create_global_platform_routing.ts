import type { Knex } from "knex";

const MODULES = [
  ["module_a", "module_a"],
  ["module_b", "module_b"],
  ["module_c", "module_c"],
  ["module_d", "module_d"],
  ["module_e", "module_e"],
  ["module_f", "module_f"],
  ["module_g", "module_g"],
  ["module_h", "module_h"],
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.raw('create extension if not exists "pgcrypto"');

  await knex.schema.createTable("tenants", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("subdomain", 63).notNullable().unique();
    table.string("display_name", 255).notNullable();
    table.text("database_name").notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("global_module_registry", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("module_key", 63).notNullable().unique();
    table.string("schema_name", 63).notNullable().unique();
    table.string("display_name", 255).notNullable();
    table.boolean("is_available").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("tenant_module_activations", (table) => {
    table.uuid("tenant_id").notNullable();
    table.uuid("module_id").notNullable();
    table.boolean("is_enabled").notNullable().defaultTo(false);
    table.timestamp("activated_at", { useTz: true });
    table.timestamp("deactivated_at", { useTz: true });
    table.primary(["tenant_id", "module_id"]);
    table
      .foreign("tenant_id")
      .references("id")
      .inTable("tenants")
      .onDelete("CASCADE");
    table
      .foreign("module_id")
      .references("id")
      .inTable("global_module_registry")
      .onDelete("CASCADE");
  });

  await knex("global_module_registry").insert(
    MODULES.map(([moduleKey, schemaName]) => ({
      module_key: moduleKey,
      schema_name: schemaName,
      display_name: schemaName.replace("_", " ").replace(/^./, (value) => value.toUpperCase()),
      is_available: true,
    })),
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tenant_module_activations");
  await knex.schema.dropTableIfExists("global_module_registry");
  await knex.schema.dropTableIfExists("tenants");
}