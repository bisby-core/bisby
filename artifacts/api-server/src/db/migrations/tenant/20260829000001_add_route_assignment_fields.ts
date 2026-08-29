import type { Knex } from "knex";

const CORE_SCHEMA = "core_admin";
const LEGACY_PERMISSION_UNIQUE =
  "tab_permissions_client_account_id_module_schema_tab_key_unique";
const ROUTE_ASSIGNMENT_UNIQUE = "tab_permissions_route_assignment_unique";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("client_accounts", (table) => {
      table.string("account_type", 16).notNullable().defaultTo("client");
    });

  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("tab_permissions", (table) => {
      table.string("workspace_key", 16).notNullable().defaultTo("ws-1");
    });

  await knex.raw(
    `alter table "${CORE_SCHEMA}"."tab_permissions" ` +
      `drop constraint if exists "${LEGACY_PERMISSION_UNIQUE}", ` +
      `drop constraint if exists "tab_permissions_account_tab_unique"`,
  );
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("tab_permissions", (table) => {
      table.unique([
        "client_account_id",
        "module_schema",
        "workspace_key",
        "tab_key",
      ], ROUTE_ASSIGNMENT_UNIQUE);
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `alter table "${CORE_SCHEMA}"."tab_permissions" ` +
      `drop constraint if exists "${ROUTE_ASSIGNMENT_UNIQUE}"`,
  );
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("tab_permissions", (table) => {
      table.unique(["client_account_id", "module_schema", "tab_key"]);
      table.dropColumn("workspace_key");
    });
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("client_accounts", (table) => {
      table.dropColumn("account_type");
    });
}