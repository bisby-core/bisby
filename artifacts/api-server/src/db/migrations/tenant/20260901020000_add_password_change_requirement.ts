import type { Knex } from "knex";

const CORE_SCHEMA = "core_admin";
const TABLE_NAME = "client_accounts";
const COLUMN_NAME = "must_change_password";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema
    .withSchema(CORE_SCHEMA)
    .hasColumn(TABLE_NAME, COLUMN_NAME);

  if (hasColumn) {
    return;
  }

  await knex.schema.withSchema(CORE_SCHEMA).alterTable(TABLE_NAME, (table) => {
    table.boolean(COLUMN_NAME).notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema
    .withSchema(CORE_SCHEMA)
    .hasColumn(TABLE_NAME, COLUMN_NAME);

  if (hasColumn) {
    await knex.schema.withSchema(CORE_SCHEMA).alterTable(TABLE_NAME, (table) => {
      table.dropColumn(COLUMN_NAME);
    });
  }
}