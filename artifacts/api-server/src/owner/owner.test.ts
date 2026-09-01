import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OwnerTenantAdministratorCreateBody,
  OwnerTenantAdministratorParams,
  OwnerTenantIdParams,
  OwnerTenantModuleParams,
  OwnerTenantAdministratorResetBody,
  OwnerToggleBody,
  ProvisionTenantBody,
} from "../routes/schemas";
import { isRootHost } from "./auth";
import {
  createOwnerSessionToken,
  verifyOwnerSessionToken,
} from "./session";

const SECRET = "owner-session-unit-test-secret";

test("creates a separate expiring owner session", () => {
  const token = createOwnerSessionToken("platform-owner", SECRET, 1_000);
  assert.deepEqual(verifyOwnerSessionToken(token, SECRET, 1_001), {
    username: "platform-owner",
    expiresAt: 28_801_000,
  });
  assert.equal(verifyOwnerSessionToken(`${token}x`, SECRET, 1_001), null);
  assert.equal(verifyOwnerSessionToken(token, SECRET, 28_801_000), null);
});

test("accepts owner routes only on root production hosts", () => {
  const previousEnvironment = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
  try {
    assert.equal(isRootHost("bisby.pro", "bisby.pro"), true);
    assert.equal(isRootHost("www.bisby.pro", "bisby.pro"), true);
    assert.equal(isRootHost("clientalpha.bisby.pro", "bisby.pro"), false);
    assert.equal(isRootHost("bisby.pro.example.org", "bisby.pro"), false);
    assert.equal(isRootHost("preview.replit.dev", "bisby.pro"), false);
  } finally {
    if (previousEnvironment === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = previousEnvironment;
    }
  }
});

test("validates tenant and physical database provisioning input", () => {
  const valid = ProvisionTenantBody.safeParse({
    subdomain: "northwind-health",
    displayName: "Northwind Health",
    databaseName: "bisby_northwind_health",
    adminUsername: "admin",
    adminPassword: "long-temporary-password",
  });
  assert.equal(valid.success, true);

  assert.equal(
    ProvisionTenantBody.safeParse({
      subdomain: "www",
      displayName: "Reserved",
      databaseName: "bisby_reserved",
      adminUsername: "admin",
      adminPassword: "long-temporary-password",
    }).success,
    false,
  );
  assert.equal(
    ProvisionTenantBody.safeParse({
      subdomain: "unsafe",
      displayName: "Unsafe",
      databaseName: "postgres://host/database?search_path=tenant",
      adminUsername: "admin",
      adminPassword: "short",
    }).success,
    false,
  );
});

test("validates owner lifecycle mutation inputs", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  assert.equal(OwnerTenantIdParams.safeParse({ tenantId }).success, true);
  assert.equal(
    OwnerTenantModuleParams.safeParse({
      tenantId,
      moduleKey: "module_h",
    }).success,
    true,
  );
  assert.equal(OwnerToggleBody.safeParse({ active: false }).success, true);

  assert.equal(
    OwnerTenantModuleParams.safeParse({
      tenantId,
      moduleKey: "module_i",
    }).success,
    false,
  );
  assert.equal(OwnerToggleBody.safeParse({ active: "false" }).success, false);
  assert.equal(OwnerTenantIdParams.safeParse({ tenantId: "not-a-uuid" }).success, false);
});

test("validates tenant administrator password reset input", () => {
  assert.equal(
    OwnerTenantAdministratorResetBody.safeParse({
      username: "admin",
      temporaryPassword: "temporary-password",
    }).success,
    true,
  );
  assert.equal(
    OwnerTenantAdministratorResetBody.safeParse({
      username: "admin",
      temporaryPassword: "short",
    }).success,
    false,
  );
  assert.equal(
    OwnerTenantAdministratorResetBody.safeParse({
      username: "admin",
      temporaryPassword: "temporary-password",
      passwordHash: "should-not-be-accepted",
    }).success,
    false,
  );
});

test("validates tenant administrator creation input", () => {
  assert.equal(
    OwnerTenantAdministratorCreateBody.safeParse({
      username: "ops-admin",
      displayName: "Operations Administrator",
      temporaryPassword: "temporary-password",
    }).success,
    true,
  );
  assert.equal(
    OwnerTenantAdministratorCreateBody.safeParse({
      username: "ops-admin",
      displayName: "",
      temporaryPassword: "short",
    }).success,
    false,
  );
  assert.equal(
    OwnerTenantAdministratorCreateBody.safeParse({
      username: "ops-admin",
      displayName: "Operations Administrator",
      temporaryPassword: "temporary-password",
      accountType: "client",
    }).success,
    false,
  );
});

test("validates tenant administrator status route identifiers", () => {
  assert.equal(
    OwnerTenantAdministratorParams.safeParse({
      tenantId: "11111111-1111-4111-8111-111111111111",
      administratorId: "22222222-2222-4222-8222-222222222222",
    }).success,
    true,
  );
  assert.equal(
    OwnerTenantAdministratorParams.safeParse({
      tenantId: "design",
      administratorId: "admin",
    }).success,
    false,
  );
});
