import assert from "node:assert/strict";
import { test } from "node:test";
import type { Knex } from "knex";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import {
  createManagedTenantAccount,
  deleteManagedTenantAccount,
  getTenantAdminSnapshot,
  resetManagedTenantAccountPassword,
  TenantAdministrationError,
  updateManagedTenantAccountAccess,
  updateManagedTenantAccountStatus,
} from "./accounts";
import {
  deleteTenantAdminStaff,
  listTenantAdminStaffSnapshot,
  tenantAdminStaffRouteAccess,
  updateTenantAdminStaffStatus,
} from "./tenant-admin-staff";
import { TenantAdminUserParams, TenantAdminUserStatusBody } from "../routes/schemas";

const noDatabase = {} as Knex;

function actor(
  role: AuthenticatedLocalUser["role"],
  moduleKey: AuthenticatedLocalUser["moduleKey"] = null,
): AuthenticatedLocalUser {
  return {
    accountId: "00000000-0000-4000-8000-000000000001",
    tenantId: "tenant-1",
    username: "actor",
    role,
    moduleKey,
    workspaceKeys: [],
    workspaceAssignments: [],
    requiresPasswordChange: false,
  };
}

test("module staff cannot open the administration snapshot", async () => {
  await assert.rejects(
    getTenantAdminSnapshot(
      noDatabase,
      actor("module_staff", "module_a"),
      "tenant-1",
      "design",
      "Design",
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("tenant admin staff cannot open an administration snapshot or manage tenant admin staff", async () => {
  await assert.rejects(
    getTenantAdminSnapshot(noDatabase, actor("tenant_admin_staff"), "tenant-1", "design", "Design", ["module_a"]),
    (error: unknown) => error instanceof TenantAdministrationError && error.code === "administration_forbidden",
  );
  await assert.rejects(
    listTenantAdminStaffSnapshot(noDatabase, actor("tenant_admin_staff")),
    (error: unknown) => error instanceof TenantAdministrationError && error.code === "administration_forbidden",
  );
});

test("other accounts cannot access a Tenant Admin Staff Workspace", async () => {
  assert.equal(await tenantAdminStaffRouteAccess(noDatabase, actor("tenant_admin"), "tasw-1"), false);
});

test("tenant admin staff access is granted only when the Tenant Admin Staff Workspace assignment exists", async () => {
  const assignedDatabase = (() => {
    const query = {
      join: () => query,
      where: () => query,
      first: async () => ({ workspace_key: "tasw-1" }),
    };
    return () => query;
  })() as unknown as Knex;
  const unassignedDatabase = (() => {
    const query = {
      join: () => query,
      where: () => query,
      first: async () => undefined,
    };
    return () => query;
  })() as unknown as Knex;
  assert.equal(await tenantAdminStaffRouteAccess(assignedDatabase, actor("tenant_admin_staff"), "tasw-1"), true);
  assert.equal(await tenantAdminStaffRouteAccess(unassignedDatabase, actor("tenant_admin_staff"), "tasw-1"), false);
});

test("tenant admin cannot create module staff directly", async () => {
  await assert.rejects(
    createManagedTenantAccount(
      noDatabase,
      actor("tenant_admin"),
      {
        username: "module.staff",
        displayName: "Module Staff",
        role: "module_staff",
        moduleKey: "module_a",
        workspaceKeys: ["ws-1"],
        temporaryPassword: "Temporary-Password-123",
      },
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("tenant admin cannot create client accounts directly", async () => {
  await assert.rejects(
    createManagedTenantAccount(
      noDatabase,
      actor("tenant_admin"),
      {
        username: "module.client",
        displayName: "Module Client",
        role: "client",
        moduleKey: "module_a",
        workspaceKeys: ["ws-1"],
        temporaryPassword: "Temporary-Password-123",
      },
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("module admin cannot create module staff outside its module", async () => {
  await assert.rejects(
    createManagedTenantAccount(
      noDatabase,
      actor("module_admin", "module_a"),
      {
        username: "module.staff",
        displayName: "Module Staff",
        role: "module_staff",
        moduleKey: "module_b",
        workspaceKeys: ["ws-1"],
        temporaryPassword: "Temporary-Password-123",
      },
      ["module_a", "module_b"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("module staff creation requires an explicit workspace assignment", async () => {
  await assert.rejects(
    createManagedTenantAccount(
      noDatabase,
      actor("module_admin", "module_a"),
      {
        username: "module.staff",
        displayName: "Module Staff",
        role: "module_staff",
        moduleKey: "module_a",
        workspaceKeys: [],
        temporaryPassword: "Temporary-Password-123",
      },
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "invalid_account_assignment",
  );
});

test("client creation requires an explicit workspace assignment", async () => {
  await assert.rejects(
    createManagedTenantAccount(
      noDatabase,
      actor("module_admin", "module_a"),
      {
        username: "module.client",
        displayName: "Module Client",
        role: "client",
        moduleKey: "module_a",
        workspaceKeys: [],
        temporaryPassword: "Temporary-Password-123",
      },
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "invalid_account_assignment",
  );
});

test("tenant admin cannot change module staff or client access", async () => {
  await assert.rejects(
    updateManagedTenantAccountAccess(
      noDatabase,
      actor("tenant_admin"),
      "00000000-0000-4000-8000-000000000002",
      {
        role: "client",
        workspaceKeys: ["ws-1"],
      },
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("tenant admin cannot activate or deactivate a module admin account", async () => {
  await assert.rejects(
    updateManagedTenantAccountStatus(
      noDatabase,
      actor("tenant_admin"),
      "00000000-0000-4000-8000-000000000002",
      false,
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("only a module admin can suspend or delete module staff", async () => {
  const accountId = "00000000-0000-4000-8000-000000000002";
  const forbidden = (error: unknown) =>
    error instanceof TenantAdministrationError &&
    error.code === "administration_forbidden";
  await assert.rejects(
    updateManagedTenantAccountStatus(
      noDatabase,
      actor("tenant_admin"),
      accountId,
      false,
      ["module_a"],
    ),
    forbidden,
  );
  await assert.rejects(
    deleteManagedTenantAccount(
      noDatabase,
      actor("tenant_admin"),
      accountId,
      ["module_a"],
    ),
    forbidden,
  );
});

test("tenant admin staff lifecycle is forbidden to non-tenant-admin accounts", async () => {
  const accountId = "00000000-0000-4000-8000-000000000002";
  const moduleAdmin = actor("module_admin", "module_a");
  const forbidden = (error: unknown) =>
    error instanceof TenantAdministrationError &&
    error.code === "administration_forbidden";
  await assert.rejects(
    updateTenantAdminStaffStatus(noDatabase, moduleAdmin, accountId, false),
    forbidden,
  );
  await assert.rejects(
    deleteTenantAdminStaff(noDatabase, moduleAdmin, accountId),
    forbidden,
  );
});

test("tenant admin staff status changes write a transactional tenant audit record", async () => {
  const audits: Record<string, unknown>[] = [];
  const accountId = "00000000-0000-4000-8000-000000000002";
  const transaction = Object.assign(((table: string) => {
    const query = {
      where: () => query,
      andWhere: () => query,
      first: async () => table === "core_admin.client_accounts"
        ? {
            id: accountId,
            username: "tenant.staff",
            display_name: "Tenant Admin Staff",
            is_active: true,
            must_change_password: false,
            created_at: new Date(),
          }
        : undefined,
      update: async () => 1,
      insert: async (row: Record<string, unknown>) => { audits.push(row); },
    };
    return query;
  }) as unknown as Knex.Transaction, { fn: { now: () => new Date() } });
  const database = Object.assign(
    () => undefined,
    { transaction: async (callback: (tx: Knex.Transaction) => Promise<unknown>) => callback(transaction) },
  ) as unknown as Knex;

  await updateTenantAdminStaffStatus(database, actor("tenant_admin"), accountId, false);

  assert.deepEqual(audits, [{
    event_type: "tenant.tenant_admin_staff.deactivated",
    actor_account_id: "00000000-0000-4000-8000-000000000001",
    actor_username: "actor",
    target_account_id: accountId,
    details: { username: "tenant.staff", role: "tenant_admin_staff", active: false },
  }]);
});

test("staff status and delete targets require strict payloads", () => {
  assert.equal(TenantAdminUserStatusBody.safeParse({ active: false }).success, true);
  assert.equal(TenantAdminUserStatusBody.safeParse({ active: "false" }).success, false);
  assert.equal(TenantAdminUserStatusBody.safeParse({ active: false, workspaceKeys: [] }).success, false);
  assert.equal(TenantAdminUserParams.safeParse({ accountId: "not-a-uuid" }).success, false);
});

test("module admin loses administration access when its module is disabled", async () => {
  await assert.rejects(
    getTenantAdminSnapshot(
      noDatabase,
      actor("module_admin", "module_a"),
      "tenant-1",
      "design",
      "Design",
      ["module_b"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("disabled module admin cannot call account mutation services", async () => {
  const disabledActor = actor("module_admin", "module_a");
  const accountId = "00000000-0000-4000-8000-000000000002";
  const isForbidden = (error: unknown) =>
    error instanceof TenantAdministrationError &&
    error.code === "administration_forbidden";

  await assert.rejects(
    updateManagedTenantAccountStatus(
      noDatabase,
      disabledActor,
      accountId,
      false,
      ["module_b"],
    ),
    isForbidden,
  );
  await assert.rejects(
    resetManagedTenantAccountPassword(
      noDatabase,
      disabledActor,
      accountId,
      "Temporary-Password-123",
      ["module_b"],
    ),
    isForbidden,
  );
  await assert.rejects(
    updateManagedTenantAccountAccess(
      noDatabase,
      disabledActor,
      accountId,
      { role: "client", workspaceKeys: ["ws-1"] },
      ["module_b"],
    ),
    isForbidden,
  );
});