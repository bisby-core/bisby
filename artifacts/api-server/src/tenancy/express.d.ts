import type { Knex } from "knex";
import type { TenantContext } from "./contracts";

export interface AuthenticatedLocalUser {
  readonly accountId: string;
  readonly tenantId: string;
  readonly role: "staff" | "client";
  readonly requiresPasswordChange: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedLocalUser;
      tenantContext?: TenantContext;
      tenantDatabase?: Knex;
      ownerUsername?: string;
    }
  }
}

export {};