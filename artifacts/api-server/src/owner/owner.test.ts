import assert from "node:assert/strict";
import { test } from "node:test";
import { ProvisionTenantBody, TenantLifecycleBody, TenantModuleLifecycleBody } from "../routes/schemas";
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

test("validates explicit tenant and module lifecycle states", () => {
  assert.equal(TenantLifecycleBody.safeParse({ active: false }).success, true);
  assert.equal(TenantLifecycleBody.safeParse({ active: "false" }).success, false);
  assert.equal(TenantModuleLifecycleBody.safeParse({ active: true }).success, true);
  assert.equal(TenantModuleLifecycleBody.safeParse({}).success, false);
});
