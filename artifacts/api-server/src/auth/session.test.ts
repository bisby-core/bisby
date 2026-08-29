import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSessionToken,
  verifySessionToken,
} from "./session";

const SECRET = "unit-test-session-secret";
const SESSION = {
  accountId: "account-1",
  tenantId: "tenant-1",
  role: "staff" as const,
};

test("creates and verifies a tenant-bound session", () => {
  const token = createSessionToken(SESSION, SECRET, 1_000);
  const verified = verifySessionToken(token, SECRET, 1_001);

  assert.deepEqual(verified, {
    ...SESSION,
    expiresAt: 28_801_000,
  });
});

test("rejects tampered, expired, and cross-tenant sessions", () => {
  const token = createSessionToken(SESSION, SECRET, 1_000);
  assert.equal(verifySessionToken(`${token}x`, SECRET, 1_001), null);
  assert.equal(verifySessionToken(token, SECRET, 28_801_000), null);

  const otherTenantToken = createSessionToken(
    { ...SESSION, tenantId: "tenant-2" },
    SECRET,
    1_000,
  );
  const verified = verifySessionToken(otherTenantToken, SECRET, 1_001);
  assert.notEqual(verified, null);
  assert.notEqual(verified?.tenantId, SESSION.tenantId);
});