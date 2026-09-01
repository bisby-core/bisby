import type { Knex } from "knex";

export interface OwnerTenantSummary {
  readonly id: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly active: boolean;
  readonly enabledModuleCount: number;
  readonly createdAt: string;
}

export interface AuditEntry {
  readonly id: number;
  readonly actorUsername: string;
  readonly action: string;
  readonly tenantId: string | null;
  readonly createdAt: string;
}

export async function listOwnerTenants(database: Knex): Promise<OwnerTenantSummary[]> {
  const rows = await database("tenants as tenants")
    .leftJoin("tenant_module_activations as activations", function () {
      this.on("activations.tenant_id", "=", "tenants.id").andOn("activations.is_enabled", "=", database.raw("true"));
    })
    .select("tenants.id", "tenants.subdomain", "tenants.display_name", "tenants.is_active", "tenants.created_at")
    .count("activations.module_id as enabled_module_count")
    .groupBy("tenants.id", "tenants.subdomain", "tenants.display_name", "tenants.is_active", "tenants.created_at")
    .orderBy("tenants.created_at", "desc");
  return rows.map((row) => ({
    id: String(row.id),
    subdomain: String(row.subdomain),
    displayName: String(row.display_name),
    active: Boolean(row.is_active),
    enabledModuleCount: Number(row.enabled_module_count),
    createdAt: new Date(row.created_at as string | number | Date).toISOString(),
  }));
}

export async function listAuditEntries(database: Knex): Promise<AuditEntry[]> {
  const rows = await database("platform_audit_log").select("id", "actor_username", "action", "tenant_id", "created_at").orderBy("created_at", "desc").limit(20);
  return rows.map((row) => ({ id: Number(row.id), actorUsername: row.actor_username, action: row.action, tenantId: row.tenant_id, createdAt: new Date(row.created_at).toISOString() }));
}

export async function recordOwnerAudit(database: Knex, entry: { actorUsername: string; action: string; tenantId?: string; metadata?: Record<string, unknown> }): Promise<void> {
  await database("platform_audit_log").insert({ actor_username: entry.actorUsername, action: entry.action, tenant_id: entry.tenantId ?? null, metadata: JSON.stringify(entry.metadata ?? {}) });
}
