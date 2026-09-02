import assert from "node:assert/strict";
import { test } from "node:test";
import type { Knex } from "knex";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import { TenantAdministrationError } from "./accounts";
import {
  addModuleWorkspaceHierarchyNode,
  createModuleWorkspace,
  listModuleWorkspaces,
  removeModuleWorkspace,
  removeModuleWorkspaceHierarchyNode,
  updateWorkspaceContentAccess,
  updateModuleWorkspaceHierarchyNode,
} from "./workspaces";
import {
  addTenantAdminStaffWorkspaceHierarchyNode,
  removeTenantAdminStaffWorkspaceHierarchyNode,
  updateTenantAdminStaffWorkspaceAccess,
} from "./tenant-admin-staff";

const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error("The database must not be reached for a rejected actor.");
    },
  },
) as Knex;

function emptyDatabase(): Knex {
  const builder = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: readonly unknown[]) => void) => resolve([]);
        }
        return () => builder;
      },
    },
  );
  return (() => builder) as unknown as Knex;
}

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

const isInvalidHierarchy = (error: unknown) =>
  error instanceof TenantAdministrationError &&
  error.code === "invalid_workspace_hierarchy";

test("tenant admin cannot control Module Staff Workspaces", async () => {
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
  await assert.rejects(
    addModuleWorkspaceHierarchyNode(
      noDatabase,
      tenantAdmin,
      {
        type: "page",
        key: "reports",
        displayName: "Reports",
        sortOrder: 1,
        parentType: null,
        parentKey: null,
      },
      ["module_a"],
    ),
    isForbidden,
  );
  await assert.rejects(
    updateModuleWorkspaceHierarchyNode(
      noDatabase,
      tenantAdmin,
      "page",
      "workspace",
      {
        key: "home",
        displayName: "Home",
        sortOrder: 0,
        parentType: null,
        parentKey: null,
      },
      ["module_a"],
    ),
    isForbidden,
  );
  await assert.rejects(
    removeModuleWorkspaceHierarchyNode(
      noDatabase,
      tenantAdmin,
      "page",
      "workspace",
      ["module_a"],
    ),
    isForbidden,
  );
});

test("only tenant admins can control Design Admin Staff Workspace hierarchy and access", async () => {
  const staff = actor("tenant_admin_staff");
  await assert.rejects(
    addTenantAdminStaffWorkspaceHierarchyNode(noDatabase, staff, {
      type: "card",
      key: "approvals",
      displayName: "Approvals",
      sortOrder: 3,
      parentType: "tab",
      parentKey: "overview",
    }),
    isForbidden,
  );
  await assert.rejects(
    removeTenantAdminStaffWorkspaceHierarchyNode(noDatabase, staff, "card", "content"),
    isForbidden,
  );
  await assert.rejects(
    updateTenantAdminStaffWorkspaceAccess(noDatabase, staff, "tasw-1", [
      { nodeId: "00000000-0000-4000-8000-000000000002", accessLevel: "view_only" },
    ]),
    isForbidden,
  );
});

test("structurally invalid hierarchy parents are rejected as invalid input", async () => {
  await assert.rejects(
    addModuleWorkspaceHierarchyNode(
      emptyDatabase(),
      actor("module_admin", "module_a"),
      {
        type: "card",
        key: "invalid-card",
        displayName: "Invalid Card",
        sortOrder: 0,
        parentType: "page",
        parentKey: "workspace",
      },
      ["module_a"],
    ),
    isInvalidHierarchy,
  );
  await assert.rejects(
    addTenantAdminStaffWorkspaceHierarchyNode(emptyDatabase(), actor("tenant_admin"), {
      type: "tab",
      key: "invalid-tab",
      displayName: "Invalid Tab",
      sortOrder: 0,
      parentType: "tab",
      parentKey: "overview",
    }),
    isInvalidHierarchy,
  );
});

test("module admin cannot read a different enabled module", async () => {
  await assert.rejects(
    listModuleWorkspaces(
      noDatabase,
      actor("module_admin", "module_a"),
      ["module_a", "module_b"],
      "module_b",
    ),
    isForbidden,
  );
});

test("tenant admin must explicitly select an enabled module", async () => {
  const tenantAdmin = actor("tenant_admin");
  await assert.rejects(
    listModuleWorkspaces(noDatabase, tenantAdmin, ["module_a"]),
    isForbidden,
  );
  await assert.rejects(
    listModuleWorkspaces(noDatabase, tenantAdmin, ["module_a"], "module_b"),
    isForbidden,
  );
});

test("tenant admin can read the explicitly selected enabled module", async () => {
  const snapshot = await listModuleWorkspaces(
    emptyDatabase(),
    actor("tenant_admin"),
    ["module_a"],
    "module_a",
  );
  assert.deepEqual(snapshot, { moduleKey: "module_a", workspaces: [] });
});

test("module admin cannot control Module Staff Workspaces after the module is disabled", async () => {
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