import type { Knex } from "knex";
import { hashPassword } from "../auth/password";
import { createPostgresClient } from "../db/knex";
import { recordPlatformAudit } from "./control-plane";

interface TenantRow { readonly subdomain: string; readonly database_name: string; }
interface AccountRow { readonly id: string; readonly username: string; readonly display_name: string; readonly is_active: boolean; }

export interface TenantAdministrator {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly active: boolean;
}

async function getTenant(masterDatabase: Knex, tenantId: string): Promise<TenantRow> {
  const tenant = await masterDatabase("tenants").select("subdomain", "database_name").where({ id: tenantId }).first<TenantRow>();
  if (!tenant) throw new Error("tenant_not_found");
  return tenant;
}

export async function listTenantAdministrators(masterDatabase: Knex, tenantId: string): Promise<TenantAdministrator[]> {
  const tenant = await getTenant(masterDatabase, tenantId);
  const database = createPostgresClient({ databaseName: tenant.database_name });
  try {
    const accounts = await database<AccountRow>("core_admin.client_accounts").select("id", "username", "display_name", "is_active").where("account_type", "staff").orderBy("username");
    return accounts.map((account) => ({ id: account.id, username: account.username, displayName: account.display_name, active: account.is_active }));
  } finally { await database.destroy(); }
}

export async function resetTenantAdministratorPassword(masterDatabase: Knex, actorUsername: string, tenantId: string, administratorUsername: string, temporaryPassword: string): Promise<void> {
  const tenant = await getTenant(masterDatabase, tenantId);
  const passwordHash = await hashPassword(temporaryPassword);
  const database = createPostgresClient({ databaseName: tenant.database_name });
  try {
    const updated = await database("core_admin.client_accounts").where({ username: administratorUsername, account_type: "staff", is_active: true }).update({ password_hash: passwordHash, updated_at: database.fn.now() });
    if (updated !== 1) throw new Error("administrator_not_found");
  } finally { await database.destroy(); }
  await recordPlatformAudit(masterDatabase, { eventType: "owner.tenant_administrator.password_reset", actorUsername, subdomain: tenant.subdomain, details: { administratorUsername } });
}
