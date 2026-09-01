import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_audit_log", (table) => {
    table.bigIncrements("id").primary();
    table.string("actor_username", 255).notNullable();
    table.string("action", 100).notNullable();
    table.uuid("tenant_id").references("id").inTable("tenants").onDelete("SET NULL");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["created_at"]);
    table.index(["tenant_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_audit_log");
}
