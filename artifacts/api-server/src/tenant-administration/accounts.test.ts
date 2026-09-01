import assert from "node:assert/strict";
import { test } from "node:test";
import type { Knex } from "knex";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import {
  createManagedTenantAccount,
  getTenantAdministrationSnapshot,
  resetManagedTenantAccountPassword,
  TenantAdministrationError,
  updateManagedTenantAccountAccess,
  updateManagedTenantAccountStatus,
} from "./accounts";

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
    getTenantAdministrationSnapshot(
      noDatabase,
      actor("module_staff", "module_a"),
      "tenant-1",
      "design",
      ["module_a"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("tenant administrators cannot create module staff directly", async () => {
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

test("tenant administrators cannot create client accounts directly", async () => {
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

test("module administrators cannot create staff outside their module", async () => {
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

test("tenant administrators cannot change staff or client access", async () => {
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

test("module administrators lose administration access when their module is disabled", async () => {
  await assert.rejects(
    getTenantAdministrationSnapshot(
      noDatabase,
      actor("module_admin", "module_a"),
      "tenant-1",
      "design",
      ["module_b"],
    ),
    (error: unknown) =>
      error instanceof TenantAdministrationError &&
      error.code === "administration_forbidden",
  );
});

test("disabled module administrators cannot call account mutation services", async () => {
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