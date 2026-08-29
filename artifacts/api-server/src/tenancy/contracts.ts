import type { ModuleSchemaName } from "../modules/module-schemas";

export interface TenantRegistryRecord {
  readonly tenantId: string;
  readonly subdomain: string;
  /**
   * A server-side reference or encrypted value managed by the master layer.
   * Raw credentials must never be serialized into a browser response.
   */
  readonly databaseConnectionReference: string;
  readonly active: boolean;
  readonly enabledModules: readonly ModuleSchemaName[];
}

export interface TenantContext {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly databaseConnectionReference: string;
  readonly enabledModules: readonly ModuleSchemaName[];
}

export interface TenantRegistry {
  findBySubdomain(subdomain: string): Promise<TenantRegistryRecord | null>;
}

export interface TenantDatabaseBinding {
  readonly tenantId: string;
  readonly query: (text: string, values?: readonly unknown[]) => Promise<unknown>;
  readonly release?: () => Promise<void>;
}

export interface TenantDatabaseResolver {
  resolve(record: TenantRegistryRecord): Promise<TenantDatabaseBinding>;
}