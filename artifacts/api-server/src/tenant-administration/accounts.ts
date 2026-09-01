import type { Knex } from "knex";
import { hashPassword } from "../auth/password";
import type { LocalAccountRole } from "../auth/roles";
import type { ModuleSchemaName } from "../modules/module-schemas";
import type { AuthenticatedLocalUser } from "../tenancy/express";

const PERMISSION_KEY = "workspace_access";

interface ManagedAccountRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly account_type: string;
  readonly module_key: ModuleSchemaName | null;
  readonly is_active: boolean;
  readonly must_change_password: boolean;
  readonly created_at: Date | string;
  readonly updated_at?: Date | string;
  readonly password_hash?: string;
}

interface PermissionRow {
  readonly client_account_id: string;
  readonly workspace_key: string;
}

interface WorkspaceOptionRow {
  readonly module_schema: ModuleSchemaName;
  readonly workspace_key: string;
  readonly display_name: string;
  readonly sort_order: number;
}

export interface ManagedWorkspaceOption {
  readonly moduleKey: ModuleSchemaName;
  readonly workspaceKey: string;
  readonly displayName: string;
}

export interface ManagedTenantAccount {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: "module_admin" | "module_staff" | "client";
  readonly moduleKey: ModuleSchemaName;
  readonly workspaceKeys: readonly string[];
  readonly isActive: boolean;
  readonly requiresPasswordChange: boolean;
  readonly createdAt: string;
}

export interface TenantAdministrationSnapshot {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly enabledModules: readonly ModuleSchemaName[];
  readonly currentUser: {
    readonly accountId: string;
    readonly username: string;
    readonly role: LocalAccountRole;
    readonly moduleKey: ModuleSchemaName | null;
  };
  readonly workspaces: readonly ManagedWorkspaceOption[];
  readonly users: readonly ManagedTenantAccount[];
}

export interface ManagedAccountCreateInput {
  readonly username: string;
  readonly displayName: string;
  readonly role: "module_admin" | "module_staff" | "client";
  readonly moduleKey: ModuleSchemaName;
  readonly workspaceKeys: readonly string[];
  readonly temporaryPassword: string;
}

export interface ManagedAccountAccessInput {
  readonly role: "module_staff" | "client";
  readonly workspaceKeys: readonly string[];
}

export class TenantAdministrationError extends Error {
  public constructor(
    public readonly code:
      | "administration_forbidden"
      | "managed_account_not_found"
      | "managed_account_conflict"
      | "invalid_account_assignment",
    message: string,
  ) {
    super(message);
    this.name = "TenantAdministrationError";
  }
}

function managedRolesFor(actor: AuthenticatedLocalUser): readonly LocalAccountRole[] {
  if (actor.role === "tenant_admin") return ["module_admin"];
  if (actor.role === "module_admin") return ["module_staff", "client"];
  return [];
}

function assertCanManageRole(
  actor: AuthenticatedLocalUser,
  role: LocalAccountRole,
  moduleKey: ModuleSchemaName | null,
): asserts role is "module_admin" | "module_staff" | "client" {
  if (!managedRolesFor(actor).includes(role)) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "This account cannot manage the requested account role.",
    );
  }
  if (!moduleKey || (actor.role === "module_admin" && actor.moduleKey !== moduleKey)) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "This account cannot manage users outside its assigned module.",
    );
  }
}

function normalizeWorkspaceKeys(
  keys: readonly string[],
  activeWorkspaceKeys: readonly string[],
): readonly string[] {
  const activeKeys = new Set(activeWorkspaceKeys);
  return [...new Set(keys)].filter((key) => activeKeys.has(key)).sort();
}

function assertActiveAdministrationModule(
  actor: AuthenticatedLocalUser,
  moduleKey: ModuleSchemaName | null,
  enabledModules: readonly ModuleSchemaName[],
): asserts moduleKey is ModuleSchemaName {
  if (
    !moduleKey ||
    !enabledModules.includes(moduleKey) ||
    (actor.role === "module_admin" && actor.moduleKey !== moduleKey)
  ) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "This module is not active in the account's administration scope.",
    );
  }
}

async function activeWorkspaceKeysForModule(
  database: Knex,
  moduleKey: ModuleSchemaName,
): Promise<readonly string[]> {
  const rows = await database<{ workspace_key: string }>("core_admin.module_workspaces")
    .select("workspace_key")
    .where("module_schema", moduleKey)
    .andWhere("is_active", true)
    .orderBy([{ column: "sort_order", order: "asc" }, { column: "workspace_key", order: "asc" }]);
  return rows.map((row) => row.workspace_key);
}

async function validateCreateAssignment(
  database: Knex,
  actor: AuthenticatedLocalUser,
  input: ManagedAccountCreateInput,
  enabledModules: readonly ModuleSchemaName[],
): Promise<readonly string[]> {
  assertCanManageRole(actor, input.role, input.moduleKey);
  if (!enabledModules.includes(input.moduleKey)) {
    throw new TenantAdministrationError(
      "invalid_account_assignment",
      "The selected module is not enabled for this tenant.",
    );
  }
  if (input.role !== "module_admin" && input.workspaceKeys.length === 0) {
    throw new TenantAdministrationError(
      "invalid_account_assignment",
      "Staff and client accounts must be assigned at least one workspace.",
    );
  }
  const activeWorkspaceKeys = await activeWorkspaceKeysForModule(
    database,
    input.moduleKey,
  );
  const workspaceKeys =
    input.role === "module_admin"
      ? activeWorkspaceKeys
      : normalizeWorkspaceKeys(input.workspaceKeys, activeWorkspaceKeys);
  if (workspaceKeys.length === 0) {
    throw new TenantAdministrationError(
      "invalid_account_assignment",
      "Staff and client accounts must be assigned at least one workspace.",
    );
  }
  return workspaceKeys;
}

function assertCreateAssignmentScope(
  actor: AuthenticatedLocalUser,
  input: ManagedAccountCreateInput,
  enabledModules: readonly ModuleSchemaName[],
): void {
  assertCanManageRole(actor, input.role, input.moduleKey);
  if (!enabledModules.includes(input.moduleKey)) {
    throw new TenantAdministrationError(
      "invalid_account_assignment",
      "The selected module is not enabled for this tenant.",
    );
  }
  if (input.role !== "module_admin" && input.workspaceKeys.length === 0) {
    throw new TenantAdministrationError(
      "invalid_account_assignment",
      "Staff and client accounts must be assigned at least one workspace.",
    );
  }
}

function serializeAccount(
  account: ManagedAccountRow,
  workspaceKeys: readonly string[],
): ManagedTenantAccount {
  return {
    id: account.id,
    username: account.username,
    displayName: account.display_name,
    role: account.account_type as "module_admin" | "module_staff" | "client",
    moduleKey: account.module_key as ModuleSchemaName,
    workspaceKeys,
    isActive: account.is_active,
    requiresPasswordChange: account.must_change_password,
    createdAt: new Date(account.created_at).toISOString(),
  };
}

async function loadManageableAccount(
  database: Knex,
  actor: AuthenticatedLocalUser,
  accountId: string,
  forUpdate = false,
): Promise<ManagedAccountRow> {
  let query = database<ManagedAccountRow>("core_admin.client_accounts")
    .select(
      "id",
      "username",
      "display_name",
      "account_type",
      "module_key",
      "is_active",
      "must_change_password",
      "created_at",
      "password_hash",
    )
    .where({ id: accountId });
  if (forUpdate) query = query.forUpdate();
  const account = await query.first();
  if (!account) {
    throw new TenantAdministrationError(
      "managed_account_not_found",
      "That managed account was not found.",
    );
  }
  assertCanManageRole(actor, account.account_type as LocalAccountRole, account.module_key);
  return account;
}

async function recordTenantAudit(
  transaction: Knex.Transaction,
  actor: AuthenticatedLocalUser,
  eventType: string,
  targetAccountId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await transaction("core_admin.administration_audit_log").insert({
    event_type: eventType,
    actor_account_id: actor.accountId,
    actor_username: actor.username,
    target_account_id: targetAccountId,
    details,
  });
}

export async function getTenantAdministrationSnapshot(
  database: Knex,
  actor: AuthenticatedLocalUser,
  tenantId: string,
  subdomain: string,
  enabledModules: readonly ModuleSchemaName[],
): Promise<TenantAdministrationSnapshot> {
  if (managedRolesFor(actor).length === 0) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "This account does not have tenant administration access.",
    );
  }
  if (
    actor.role === "module_admin" &&
    (!actor.moduleKey || !enabledModules.includes(actor.moduleKey))
  ) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "This module is not active for the tenant.",
    );
  }
  let query = database<ManagedAccountRow>("core_admin.client_accounts")
    .select(
      "id",
      "username",
      "display_name",
      "account_type",
      "module_key",
      "is_active",
      "must_change_password",
      "created_at",
    )
    .whereIn("account_type", managedRolesFor(actor));
  if (actor.role === "module_admin") {
    query = query.andWhere("module_key", actor.moduleKey);
  } else {
    query = query.whereIn("module_key", enabledModules);
  }
  const accounts = await query.orderBy("username", "asc");
  const visibleModules =
    actor.role === "module_admin" && actor.moduleKey
      ? [actor.moduleKey]
      : enabledModules;
  const workspaces = await database<WorkspaceOptionRow>(
    "core_admin.module_workspaces",
  )
    .select("module_schema", "workspace_key", "display_name", "sort_order")
    .whereIn("module_schema", visibleModules)
    .andWhere("is_active", true)
    .orderBy([
      { column: "module_schema", order: "asc" },
      { column: "sort_order", order: "asc" },
      { column: "workspace_key", order: "asc" },
    ]);
  const accountIds = accounts.map((account) => account.id);
  const permissions = accountIds.length
    ? await database<PermissionRow>("core_admin.tab_permissions")
        .select("client_account_id", "workspace_key")
        .whereIn("client_account_id", accountIds)
        .andWhere("can_view", true)
    : [];

  return {
    tenantId,
    subdomain,
    enabledModules,
    currentUser: {
      accountId: actor.accountId,
      username: actor.username,
      role: actor.role,
      moduleKey: actor.moduleKey,
    },
    workspaces: workspaces.map((workspace) => ({
      moduleKey: workspace.module_schema,
      workspaceKey: workspace.workspace_key,
      displayName: workspace.display_name,
    })),
    users: accounts.map((account) =>
      serializeAccount(
        account,
        permissions
          .filter((permission) => permission.client_account_id === account.id)
          .map((permission) => permission.workspace_key)
          .sort(),
      ),
    ),
  };
}

export async function createManagedTenantAccount(
  database: Knex,
  actor: AuthenticatedLocalUser,
  input: ManagedAccountCreateInput,
  enabledModules: readonly ModuleSchemaName[],
): Promise<ManagedTenantAccount> {
  assertCreateAssignmentScope(actor, input, enabledModules);
  const passwordHash = await hashPassword(input.temporaryPassword);
  try {
    return await database.transaction(async (transaction) => {
      const workspaceKeys = await validateCreateAssignment(
        transaction,
        actor,
        input,
        enabledModules,
      );
      const [account] = await transaction("core_admin.client_accounts")
        .insert({
          username: input.username,
          display_name: input.displayName,
          password_hash: passwordHash,
          account_type: input.role,
          module_key: input.moduleKey,
          is_active: true,
          must_change_password: true,
        })
        .returning([
          "id",
          "username",
          "display_name",
          "account_type",
          "module_key",
          "is_active",
          "must_change_password",
          "created_at",
        ]);
      if (!account) {
        throw new TenantAdministrationError(
          "managed_account_conflict",
          "The managed account could not be created.",
        );
      }
      await transaction("core_admin.tab_permissions").insert(
        workspaceKeys.map((workspaceKey) => ({
          client_account_id: account.id,
          module_schema: input.moduleKey,
          workspace_key: workspaceKey,
          tab_key: PERMISSION_KEY,
          can_view: true,
          can_edit: true,
        })),
      );
      await recordTenantAudit(
        transaction,
        actor,
        input.role === "module_admin"
          ? "tenant.module_administrator.created"
          : input.role === "module_staff"
            ? "tenant.module_staff.created"
            : "tenant.module_client.created",
        account.id,
        {
          username: account.username,
          role: input.role,
          moduleKey: input.moduleKey,
          workspaceKeys,
        },
      );
      return serializeAccount(account, workspaceKeys);
    });
  } catch (error) {
    if (
      error instanceof TenantAdministrationError ||
      (error && typeof error === "object" && "code" in error && error.code === "23505")
    ) {
      throw new TenantAdministrationError(
        "managed_account_conflict",
        "That username is already in use in this tenant.",
      );
    }
    throw error;
  }
}

export async function updateManagedTenantAccountAccess(
  database: Knex,
  actor: AuthenticatedLocalUser,
  accountId: string,
  input: ManagedAccountAccessInput,
  enabledModules: readonly ModuleSchemaName[],
): Promise<ManagedTenantAccount> {
  if (actor.role !== "module_admin" || !actor.moduleKey) {
    throw new TenantAdministrationError(
      "administration_forbidden",
      "Only a module administrator can change staff or client access.",
    );
  }
  assertActiveAdministrationModule(actor, actor.moduleKey, enabledModules);
  const moduleKey = actor.moduleKey;

  return database.transaction(async (transaction) => {
    const account = await loadManageableAccount(transaction, actor, accountId, true);
    assertActiveAdministrationModule(actor, account.module_key, enabledModules);
    assertCanManageRole(actor, input.role, account.module_key);
    if (input.workspaceKeys.length === 0) {
      throw new TenantAdministrationError(
        "invalid_account_assignment",
        "Staff and client accounts must be assigned at least one workspace.",
      );
    }
    const activeWorkspaceKeys = await activeWorkspaceKeysForModule(
      transaction,
      moduleKey,
    );
    const workspaceKeys = normalizeWorkspaceKeys(
      input.workspaceKeys,
      activeWorkspaceKeys,
    );
    if (workspaceKeys.length === 0) {
      throw new TenantAdministrationError(
        "invalid_account_assignment",
        "Staff and client accounts must be assigned at least one workspace.",
      );
    }

    const [updated] = await transaction<ManagedAccountRow>(
      "core_admin.client_accounts",
    )
      .where({ id: account.id })
      .update({
        account_type: input.role,
        updated_at: transaction.fn.now(),
      })
      .returning([
        "id",
        "username",
        "display_name",
        "account_type",
        "module_key",
        "is_active",
        "must_change_password",
        "created_at",
      ]);
    if (!updated) {
      throw new TenantAdministrationError(
        "managed_account_not_found",
        "That managed account was not found.",
      );
    }

    await transaction("core_admin.tab_permissions")
      .where({ client_account_id: account.id })
      .delete();
    await transaction("core_admin.tab_permissions").insert(
      workspaceKeys.map((workspaceKey) => ({
        client_account_id: account.id,
        module_schema: moduleKey,
        workspace_key: workspaceKey,
        tab_key: PERMISSION_KEY,
        can_view: true,
        can_edit: true,
      })),
    );
    await recordTenantAudit(
      transaction,
      actor,
      "tenant.managed_account.access_updated",
      account.id,
      {
        username: updated.username,
        previousRole: account.account_type,
        role: input.role,
        moduleKey,
        workspaceKeys,
      },
    );
    return serializeAccount(updated, workspaceKeys);
  });
}

export async function updateManagedTenantAccountStatus(
  database: Knex,
  actor: AuthenticatedLocalUser,
  accountId: string,
  active: boolean,
  enabledModules: readonly ModuleSchemaName[],
): Promise<{ readonly accountId: string; readonly active: boolean }> {
  if (actor.role === "module_admin") {
    assertActiveAdministrationModule(actor, actor.moduleKey, enabledModules);
  }
  return database.transaction(async (transaction) => {
    const account = await loadManageableAccount(transaction, actor, accountId, true);
    assertActiveAdministrationModule(actor, account.module_key, enabledModules);
    await transaction("core_admin.client_accounts")
      .where({ id: account.id, is_active: account.is_active })
      .update({ is_active: active, updated_at: transaction.fn.now() });
    await recordTenantAudit(
      transaction,
      actor,
      active ? "tenant.managed_account.activated" : "tenant.managed_account.deactivated",
      account.id,
      { username: account.username, role: account.account_type, moduleKey: account.module_key, active },
    );
    return { accountId: account.id, active };
  });
}

export async function resetManagedTenantAccountPassword(
  database: Knex,
  actor: AuthenticatedLocalUser,
  accountId: string,
  temporaryPassword: string,
  enabledModules: readonly ModuleSchemaName[],
): Promise<{ readonly status: "password_reset"; readonly accountId: string }> {
  if (actor.role === "module_admin") {
    assertActiveAdministrationModule(actor, actor.moduleKey, enabledModules);
  }
  const passwordHash = await hashPassword(temporaryPassword);
  return database.transaction(async (transaction) => {
    const account = await loadManageableAccount(transaction, actor, accountId, true);
    assertActiveAdministrationModule(actor, account.module_key, enabledModules);
    if (!account.is_active) {
      throw new TenantAdministrationError(
        "managed_account_not_found",
        "Only active managed accounts can receive a password reset.",
      );
    }
    await transaction("core_admin.client_accounts")
      .where({ id: account.id, is_active: true })
      .update({
        password_hash: passwordHash,
        must_change_password: true,
        updated_at: transaction.fn.now(),
      });
    await recordTenantAudit(
      transaction,
      actor,
      "tenant.managed_account.password_reset",
      account.id,
      { username: account.username, role: account.account_type, moduleKey: account.module_key },
    );
    return { status: "password_reset", accountId: account.id };
  });
}