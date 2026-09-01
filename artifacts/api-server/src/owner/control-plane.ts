import type { Knex } from "knex";
import { MODULE_SCHEMA_NAMES } from "../modules/module-schemas";

export interface ControlPlaneTenant {
  readonly id: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly activeModuleCount: number;
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
    .select(
      "tenants.id",
      "tenants.subdomain",
      "tenants.display_name",
      "tenants.is_active",
      "tenants.created_at",
    )
    .countDistinct({ active_module_count: "activations.module_id" })
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
