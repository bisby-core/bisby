import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasEventType = await knex.schema.hasColumn(
    "platform_audit_log",
    "event_type",
  );
  const hasSubdomain = await knex.schema.hasColumn(
    "platform_audit_log",
    "subdomain",
  );
  const hasDetails = await knex.schema.hasColumn(
    "platform_audit_log",
    "details",
  );
  const hasAction = await knex.schema.hasColumn(
    "platform_audit_log",
    "action",
  );
  const hasTenantId = await knex.schema.hasColumn(
    "platform_audit_log",
    "tenant_id",
  );
  const hasMetadata = await knex.schema.hasColumn(
    "platform_audit_log",
    "metadata",
  );

  await knex.schema.alterTable("platform_audit_log", (table) => {
    if (!hasEventType) table.string("event_type", 127);
    if (!hasSubdomain) table.string("subdomain", 63);
    if (!hasDetails) table.jsonb("details").defaultTo(knex.raw("'{}'::jsonb"));
  });

  if (hasAction) {
    await knex.raw(`
      update platform_audit_log
      set event_type = coalesce(event_type, action)
      where event_type is null
    `);
  }
  if (hasTenantId) {
    await knex.raw(`
      update platform_audit_log as audit
      set subdomain = tenants.subdomain
      from tenants
      where audit.subdomain is null
        and audit.tenant_id = tenants.id
    `);
  }
  if (hasMetadata) {
    await knex.raw(`
      update platform_audit_log
      set details = coalesce(details, metadata, '{}'::jsonb)
      where details is null
    `);
  }

  await knex.raw(`
    update platform_audit_log
    set event_type = 'legacy.owner.action'
    where event_type is null
  `);
  await knex.raw(`
    update platform_audit_log
    set details = '{}'::jsonb
    where details is null
  `);
  await knex.raw(
    "alter table platform_audit_log alter column event_type set not null",
  );
  await knex.raw(
    "alter table platform_audit_log alter column details set not null",
  );
  await knex.raw(
    "alter table platform_audit_log alter column details set default '{}'::jsonb",
  );
  if (hasAction) {
    await knex.raw(
      "alter table platform_audit_log alter column action drop not null",
    );
  }
  await knex.raw(`
    create index if not exists platform_audit_log_event_type_index
    on platform_audit_log (event_type)
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Compatibility columns are intentionally retained on rollback so existing
  // audit records remain readable across Phase 1 and Phase 2 deployments.
}