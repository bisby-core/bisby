import type { Knex } from "knex";
import { MODULE_SCHEMA_NAMES } from "../modules/module-schemas";

export interface ControlPlaneTenant {
  readonly id: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly activeModuleCount: number;
  readonly createdAt: string;
  readonly modules: readonly ControlPlaneModule[];
}

export interface ControlPlaneModule {
  readonly moduleKey: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
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

export class OwnerControlPlaneError extends Error {
  public constructor(
    public readonly code:
      | "tenant_not_found"
      | "module_not_found"
      | "module_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "OwnerControlPlaneError";
  }
}

export async function recordPlatformAudit(
  database: Knex,
  event: {
    eventId?: string;
    eventType: string;
    actorUsername: string;
    subdomain?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await database("platform_audit_log").insert({
    ...(event.eventId ? { id: event.eventId } : {}),
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

  const moduleRows = await database("tenants")
    .crossJoin(database.raw("global_module_registry as modules"))
    .leftJoin("tenant_module_activations as activations", function joinActivations() {
      this.on("activations.tenant_id", "tenants.id").andOn(
        "activations.module_id",
        "modules.id",
      );
    })
    .select(
      "tenants.id as tenant_id",
      "modules.module_key",
      "modules.display_name",
      "modules.is_available",
      database.raw("coalesce(activations.is_enabled, false) as is_enabled"),
    ) as Array<{
      tenant_id: string;
      module_key: string;
      display_name: string;
      is_available: boolean;
      is_enabled: boolean;
    }>;

  const modulesByTenant = new Map<string, ControlPlaneModule[]>();
  for (const module of moduleRows) {
    const modules = modulesByTenant.get(module.tenant_id) ?? [];
    modules.push({
      moduleKey: module.module_key,
      displayName: module.display_name,
      isActive: module.is_enabled,
      isAvailable: module.is_available,
    });
    modulesByTenant.set(module.tenant_id, modules);
  }

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
      modules: modulesByTenant.get(tenant.id) ?? [],
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

export async function updateTenantStatus(
  database: Knex,
  actorUsername: string,
  tenantId: string,
  active: boolean,
): Promise<{
  tenantId: string;
  subdomain: string;
  active: boolean;
}> {
  return database.transaction(async (transaction) => {
    const tenant = await transaction("tenants")
      .select("id", "subdomain")
      .where({ id: tenantId })
      .first<{ id: string; subdomain: string }>();
    if (!tenant) {
      throw new OwnerControlPlaneError(
        "tenant_not_found",
        "That tenant is not registered.",
      );
    }

    await transaction("tenants")
      .where({ id: tenantId })
      .update({
        is_active: active,
        updated_at: transaction.fn.now(),
      });

    await recordPlatformAudit(transaction, {
      eventType: active
        ? "owner.tenant.activated"
        : "owner.tenant.deactivated",
      actorUsername,
      subdomain: tenant.subdomain,
      details: { tenantId, active },
    });

    return { tenantId, subdomain: tenant.subdomain, active };
  });
}

export async function updateTenantModule(
  database: Knex,
  actorUsername: string,
  tenantId: string,
  moduleKey: string,
  active: boolean,
): Promise<{
  tenantId: string;
  subdomain: string;
  moduleKey: string;
  active: boolean;
}> {
  return database.transaction(async (transaction) => {
    const tenant = await transaction("tenants")
      .select("id", "subdomain")
      .where({ id: tenantId })
      .first<{ id: string; subdomain: string }>();
    if (!tenant) {
      throw new OwnerControlPlaneError(
        "tenant_not_found",
        "That tenant is not registered.",
      );
    }

    const module = await transaction("global_module_registry")
      .select("id", "module_key", "is_available")
      .where({ module_key: moduleKey })
      .first<{ id: string; module_key: string; is_available: boolean }>();
    if (!module) {
      throw new OwnerControlPlaneError(
        "module_not_found",
        "That module is not registered globally.",
      );
    }
    if (!module.is_available) {
      throw new OwnerControlPlaneError(
        "module_unavailable",
        "That module is not currently available.",
      );
    }

    const activation = await transaction("tenant_module_activations")
      .select("tenant_id")
      .where({ tenant_id: tenantId, module_id: module.id })
      .first();
    const timestamp = transaction.fn.now();
    if (activation) {
      const activationUpdate = active
        ? {
            is_enabled: true,
            activated_at: timestamp,
            deactivated_at: null,
          }
        : {
            is_enabled: false,
            deactivated_at: timestamp,
          };
      await transaction("tenant_module_activations")
        .where({ tenant_id: tenantId, module_id: module.id })
        .update(activationUpdate);
    } else {
      await transaction("tenant_module_activations").insert({
        tenant_id: tenantId,
        module_id: module.id,
        is_enabled: active,
        activated_at: active ? timestamp : null,
        deactivated_at: active ? null : timestamp,
      });
    }

    await recordPlatformAudit(transaction, {
      eventType: active
        ? "owner.tenant.module_activated"
        : "owner.tenant.module_deactivated",
      actorUsername,
      subdomain: tenant.subdomain,
      details: { tenantId, moduleKey, active },
    });

    return { tenantId, subdomain: tenant.subdomain, moduleKey, active };
  });
}
