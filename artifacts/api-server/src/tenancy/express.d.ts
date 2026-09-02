import type { Knex } from "knex";
import type { TenantContext } from "./contracts";
import type { LocalAccountRole, WorkspaceAssignment } from "../auth/roles";
import type { ModuleSchemaName } from "../modules/module-schemas";

export interface AuthenticatedLocalUser {
  readonly accountId: string;
  readonly tenantId: string;
  readonly username: string;
  readonly role: LocalAccountRole;
  readonly moduleKey: ModuleSchemaName | null;
  readonly workspaceKeys: readonly string[];
  readonly workspaceAssignments: readonly WorkspaceAssignment[];
  readonly tenantAdminStaffWorkspaceKeys?: readonly string[];
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