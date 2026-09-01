import type { Knex } from "knex";

const CORE_SCHEMA = "core_admin";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("client_accounts", (table) => {
      table.string("module_key", 16);
    });

  await knex.raw(
    `update "${CORE_SCHEMA}"."client_accounts" ` +
      `set "account_type" = 'tenant_admin' where "account_type" = 'staff'`,
  );

  await knex.schema
    .withSchema(CORE_SCHEMA)
    .createTable("administration_audit_log", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.string("event_type", 96).notNullable();
      table.uuid("actor_account_id").notNullable();
      table.string("actor_username", 255).notNullable();
      table.uuid("target_account_id");
      table.jsonb("details").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.index(["created_at"]);
      table.index(["event_type"]);
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .dropTableIfExists("administration_audit_log");
  await knex.raw(
    `update "${CORE_SCHEMA}"."client_accounts" ` +
      `set "account_type" = 'staff' where "account_type" = 'tenant_admin'`,
  );
  await knex.schema
    .withSchema(CORE_SCHEMA)
    .alterTable("client_accounts", (table) => {
      table.dropColumn("module_key");
    });
}