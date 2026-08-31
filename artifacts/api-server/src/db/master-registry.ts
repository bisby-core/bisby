import type { Knex } from "knex";
import {
  MODULE_SCHEMA_NAMES,
  type ModuleSchemaName,
} from "../modules/module-schemas";
import type { TenantRegistry, TenantRegistryRecord } from "../tenancy/contracts";

interface TenantRow {
  id: string;
  subdomain: string;
  database_name: string;
  is_active: boolean;
}

interface ModuleRow {
  schema_name: string;
}

function isModuleSchemaName(value: string): value is ModuleSchemaName {
  return (MODULE_SCHEMA_NAMES as readonly string[]).includes(value);
}

export class KnexTenantRegistry implements TenantRegistry {
  public constructor(private readonly database: Knex) {}

  public async findBySubdomain(
    subdomain: string,
  ): Promise<TenantRegistryRecord | null> {
    const tenant = await this.database<TenantRow>("tenants")
      .select("id", "subdomain", "database_name", "is_active")
      .where({ subdomain, is_active: true })
      .first();

    if (!tenant) {
      return null;
    }

    const modules = await this.database<ModuleRow>(
      "tenant_module_activations as activations",
    )
      .join(
        "global_module_registry as modules",
        "modules.id",
        "activations.module_id",
      )
      .where("activations.tenant_id", tenant.id)
      .andWhere("activations.is_enabled", true)
      .andWhere("modules.is_available", true)
      .select("modules.schema_name");

    return {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      databaseName: tenant.database_name,
      active: tenant.is_active,
      enabledModules: modules
        .map((module) => module.schema_name)
        .filter(isModuleSchemaName),
    };
  }
}