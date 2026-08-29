import type { Knex } from "knex";
import type { TenantContext } from "./contracts";

export interface AuthenticatedLocalUser {
  readonly accountId: string;
  readonly role: "staff" | "client";
}

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedLocalUser;
      tenantContext?: TenantContext;
      tenantDatabase?: Knex;
    }
  }
}

export {};