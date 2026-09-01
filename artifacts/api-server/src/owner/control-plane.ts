import type { Knex } from "knex";
import { MODULE_SCHEMA_NAMES } from "../modules/module-schemas";

export interface ControlPlaneTenant {
  readonly id: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly activeModuleCount: number;
  readonly activeModuleKeys: readonly string[];
  readonly createdAt: string;
}

export interface PlatformAuditEvent {
  readonly eventType: string;
  readonly actorUsername: string;
  readonly subdomain: string | null;
  readonly details: Record<string, unknown>;
  readonly createdAt: string;
}

export interface ControlPlaneSnapshot {
  readonly tenants: readonly ControlPlaneTenant[];
  readonly availableModuleCount: number;
  readonly recentAudit: readonly PlatformAuditEvent[];
}

interface TenantSummaryRow {
  id: string;
  subdomain: string;
  display_name: string;
  is_active: boolean;
  active_module_count: string | number;
  created_at: Date | string;
  active_module_keys: string[] | null;
}

interface AuditRow {
  event_type: string;
  actor_username: string;
  subdomain: string | null;
  details: Record<string, unknown>;
  created_at: Date | string;
}

export async function recordPlatformAudit(
  database: Knex,
  event: {
    eventType: string;
    actorUsername: string;
    subdomain?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await database("platform_audit_log").insert({
    event_type: event.eventType,
    actor_username: event.actorUsername,
    subdomain: event.subdomain ?? null,
    details: event.details ?? {},
  });
}

export async function getControlPlaneSnapshot(
  database: Knex,
): Promise<ControlPlaneSnapshot> {
  const tenantRows = await database("tenants")
    .leftJoin(
      "tenant_module_activations as activations",
      function joinActivations() {
        this.on("activations.tenant_id", "tenants.id").andOn(
          "activations.is_enabled",
          database.raw("?", [true]),
        );
      },
    )
    .leftJoin("global_module_registry as modules", "modules.id", "activations.module_id")
    .select(
      "tenants.id",
      "tenants.subdomain",
      "tenants.display_name",
      "tenants.is_active",
      "tenants.created_at",
    )
    .countDistinct({ active_module_count: "activations.module_id" })
    .select(database.raw("coalesce(array_agg(modules.module_key) filter (where modules.module_key is not null), '{}') as active_module_keys"))
    .groupBy(
      "tenants.id",
      "tenants.subdomain",
      "tenants.display_name",
      "tenants.is_active",
      "tenants.created_at",
    )
    .orderBy("tenants.created_at", "desc") as TenantSummaryRow[];

  const auditRows = await database<AuditRow>("platform_audit_log")
    .select("event_type", "actor_username", "subdomain", "details", "created_at")
    .orderBy("created_at", "desc")
    .limit(20);

  return {
    tenants: tenantRows.map((tenant) => ({
      id: tenant.id,
      subdomain: tenant.subdomain,
      displayName: tenant.display_name,
      isActive: tenant.is_active,
      activeModuleCount: Number(tenant.active_module_count),
      activeModuleKeys: (tenant.active_module_keys ?? []).map(String),
      createdAt: new Date(tenant.created_at).toISOString(),
    })),
    availableModuleCount: MODULE_SCHEMA_NAMES.length,
    recentAudit: auditRows.map((audit) => ({
      eventType: audit.event_type,
      actorUsername: audit.actor_username,
      subdomain: audit.subdomain,
      details: audit.details ?? {},
      createdAt: new Date(audit.created_at).toISOString(),
    })),
  };
}


export async function updateTenantLifecycle(database: Knex, actorUsername: string, tenantId: string, active: boolean): Promise<void> {
  await database.transaction(async (transaction) => {
    const tenant = await transaction("tenants").select("subdomain").where({ id: tenantId }).first<{ subdomain: string }>();
    if (!tenant) throw new Error("tenant_not_found");
    await transaction("tenants").where({ id: tenantId }).update({ is_active: active, updated_at: transaction.fn.now() });
    await recordPlatformAudit(transaction, { eventType: active ? "owner.tenant.activated" : "owner.tenant.deactivated", actorUsername, subdomain: tenant.subdomain });
  });
}

export async function updateTenantModuleLifecycle(database: Knex, actorUsername: string, tenantId: string, moduleKey: string, active: boolean): Promise<void> {
  await database.transaction(async (transaction) => {
    const tenant = await transaction("tenants").select("subdomain").where({ id: tenantId }).first<{ subdomain: string }>();
    const module = await transaction("global_module_registry").select("id").where({ module_key: moduleKey, is_available: true }).first<{ id: string }>();
    if (!tenant) throw new Error("tenant_not_found");
    if (!module) throw new Error("module_not_found");
    await transaction("tenant_module_activations").insert({ tenant_id: tenantId, module_id: module.id, is_enabled: active, activated_at: active ? transaction.fn.now() : null, deactivated_at: active ? null : transaction.fn.now() }).onConflict(["tenant_id", "module_id"]).merge({ is_enabled: active, activated_at: active ? transaction.fn.now() : null, deactivated_at: active ? null : transaction.fn.now() });
    await recordPlatformAudit(transaction, { eventType: active ? "owner.tenant_module.activated" : "owner.tenant_module.deactivated", actorUsername, subdomain: tenant.subdomain, details: { moduleKey } });
  });
}
