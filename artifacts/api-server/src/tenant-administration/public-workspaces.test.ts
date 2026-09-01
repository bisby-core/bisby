import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedLocalUser } from "../tenancy/express";
import type { ModuleSchemaName } from "../modules/module-schemas";
import {
  normalizedMetadata,
  publicModuleIsEnabled,
} from "./public-workspaces";

test("normalizes public metadata without broadening workspace capabilities", () => {
  assert.deepEqual(
    normalizedMetadata({
      displayName: "Internal",
      isActive: true,
      workspaceType: "normal",
      publicVisible: true,
      contactEnabled: true,
    }),
    {
      displayName: "Internal",
      isActive: true,
      workspaceType: "normal",
      publicVisible: false,
      contactEnabled: false,
    },
  );
  assert.equal(
    normalizedMetadata({
      displayName: "Information",
      isActive: true,
      workspaceType: "public_information",
      publicVisible: true,
      contactEnabled: true,
    }).contactEnabled,
    false,
  );
});

test("publishes module workspaces only for modules enabled on the tenant", () => {
  const enabled: readonly ModuleSchemaName[] = [
    "module_a",
    "module_c",
  ];
  assert.equal(publicModuleIsEnabled("module_a", enabled), true);
  assert.equal(publicModuleIsEnabled("module_b", enabled), false);
  assert.equal(publicModuleIsEnabled(undefined, enabled), false);
});