import assert from "node:assert/strict";
import { test } from "node:test";
import type { Knex } from "knex";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import { TenantAdministrationError } from "./accounts";
import {
  createModuleWorkspace,
  listModuleWorkspaces,
  removeModuleWorkspace,
  updateWorkspaceContentAccess,
} from "./workspaces";

const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error("The database must not be reached for a rejected actor.");
    },
  },
) as Knex;

function actor(
  role: AuthenticatedLocalUser["role"],
  moduleKey: AuthenticatedLocalUser["moduleKey"] = null,
): AuthenticatedLocalUser {
  return {
    accountId: "00000000-0000-4000-8000-000000000001",
    tenantId: "tenant-1",
    username: "administrator",
    role,
    moduleKey,
    workspaceKeys: [],
    workspaceAssignments: [],
    requiresPasswordChange: false,
  };
}

const isForbidden = (error: unknown) =>
  error instanceof TenantAdministrationError &&
  error.code === "administration_forbidden";

test("tenant administrators cannot control module workspaces", async () => {
  const tenantAdmin = actor("tenant_admin");
  await assert.rejects(listModuleWorkspaces(noDatabase, tenantAdmin, ["module_a"]), isForbidden);
  await assert.rejects(
    createModuleWorkspace(noDatabase, tenantAdmin, "Regional Office", ["module_a"]),
    isForbidden,
  );
  await assert.rejects(
    removeModuleWorkspace(noDatabase, tenantAdmin, "ws-1", ["module_a"]),
    isForbidden,
  );
  await assert.rejects(
    updateWorkspaceContentAccess(
      noDatabase,
      tenantAdmin,
      "ws-1",
      [{ nodeId: "00000000-0000-4000-8000-000000000002", accessLevel: "view_only" }],
      ["module_a"],
    ),
    isForbidden,
  );
});

test("a module administrator cannot control workspaces after the module is disabled", async () => {
  const moduleAdmin = actor("module_admin", "module_a");
  await assert.rejects(listModuleWorkspaces(noDatabase, moduleAdmin, ["module_b"]), isForbidden);
  await assert.rejects(
    createModuleWorkspace(noDatabase, moduleAdmin, "Regional Office", ["module_b"]),
    isForbidden,
  );
  await assert.rejects(
    removeModuleWorkspace(noDatabase, moduleAdmin, "ws-1", ["module_b"]),
    isForbidden,
  );
  await assert.rejects(
    updateWorkspaceContentAccess(
      noDatabase,
      moduleAdmin,
      "ws-1",
      [{ nodeId: "00000000-0000-4000-8000-000000000002", accessLevel: "view_only" }],
      ["module_b"],
    ),
    isForbidden,
  );
});