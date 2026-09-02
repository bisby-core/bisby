import type { TenantContext } from "./contracts";

export const TENANT_CONTEXT_KEY = Symbol("bisby.tenant-context");

export interface TenantContextCarrier {
  [TENANT_CONTEXT_KEY]?: TenantContext;
}

export function toTenantContext(record: {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly customerName: string;
  readonly enabledModules: readonly TenantContext["enabledModules"][number][];
}): TenantContext {
  return {
    tenantId: record.tenantId,
    subdomain: record.subdomain,
    customerName: record.customerName,
    enabledModules: [...record.enabledModules],
  };
}