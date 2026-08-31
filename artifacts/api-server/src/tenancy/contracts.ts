import type { ModuleSchemaName } from "../modules/module-schemas";

export interface TenantRegistryRecord {
  readonly tenantId: string;
  readonly subdomain: string;
  /**
   * A server-only database name loaded from the master registry.
   * It must never be serialized into a browser response or log record.
   */
  readonly databaseName: string;
  readonly active: boolean;
  readonly enabledModules: readonly ModuleSchemaName[];
}

export interface TenantContext {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly enabledModules: readonly ModuleSchemaName[];
}

export interface TenantRegistry {
  findBySubdomain(subdomain: string): Promise<TenantRegistryRecord | null>;
}