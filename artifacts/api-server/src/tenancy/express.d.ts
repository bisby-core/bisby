import type { Knex } from "knex";
import type { TenantContext } from "./contracts";

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      tenantDatabase?: Knex;
    }
  }
}

export {};