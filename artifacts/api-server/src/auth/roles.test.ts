import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessWorkspace, toLocalAccountRole } from "./roles";

const enabledModules = ["module_a", "module_b"] as const;

test("tenant administrators can access every workspace in enabled modules only", () => {
  assert.equal(
    canAccessWorkspace(
      "tenant_admin",
      null,
      [],
      enabledModules,
      "module_a",
      "ws-10",
    ),
    true,
  );
  assert.equal(
    canAccessWorkspace(
      "tenant_admin",
      null,
      [],
      enabledModules,
      "module_c",
      "ws-1",
    ),
    false,
  );
});

test("module administrators are confined to their assigned enabled module", () => {
  assert.equal(
    canAccessWorkspace(
      "module_admin",
      "module_b",
      [],
      enabledModules,
      "module_b",
      "ws-9",
    ),
    true,
  );
  assert.equal(
    canAccessWorkspace(
      "module_admin",
      "module_b",
      [],
      enabledModules,
      "module_a",
      "ws-9",
    ),
    false,
  );
});

test("module staff require both their module and an explicit workspace assignment", () => {
  assert.equal(
    canAccessWorkspace(
      "module_staff",
      "module_a",
      [
        { moduleKey: "module_a", workspaceKey: "ws-2" },
        { moduleKey: "module_a", workspaceKey: "ws-7" },
      ],
      enabledModules,
      "module_a",
      "ws-7",
    ),
    true,
  );
  assert.equal(
    canAccessWorkspace(
      "module_staff",
      "module_a",
      [
        { moduleKey: "module_a", workspaceKey: "ws-2" },
        { moduleKey: "module_a", workspaceKey: "ws-7" },
      ],
      enabledModules,
      "module_a",
      "ws-3",
    ),
    false,
  );
  assert.equal(
    canAccessWorkspace(
      "module_staff",
      "module_a",
      [{ moduleKey: "module_a", workspaceKey: "ws-7" }],
      enabledModules,
      "module_b",
      "ws-7",
    ),
    false,
  );
  assert.equal(
    canAccessWorkspace(
      "module_staff",
      "module_a",
      [{ moduleKey: "module_b", workspaceKey: "ws-7" }],
      enabledModules,
      "module_a",
      "ws-7",
    ),
    false,
  );
});

test("legacy clients keep explicit workspace access and legacy staff map safely", () => {
  assert.equal(
    canAccessWorkspace(
      "client",
      "module_b",
      [{ moduleKey: "module_b", workspaceKey: "ws-4" }],
      enabledModules,
      "module_b",
      "ws-4",
    ),
    true,
  );
  assert.equal(
    canAccessWorkspace(
      "client",
      "module_a",
      [{ moduleKey: "module_b", workspaceKey: "ws-4" }],
      enabledModules,
      "module_a",
      "ws-4",
    ),
    false,
  );
  assert.equal(toLocalAccountRole("staff"), "tenant_admin");
  assert.equal(toLocalAccountRole("unknown"), null);
});