import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPlatformStaffSessionToken,
  PLATFORM_STAFF_SESSION_COOKIE_NAME,
  readPlatformStaffSessionCookie,
  verifyPlatformStaffSessionToken,
} from "./session";
import { createOwnerSessionToken, verifyOwnerSessionToken } from "../owner/session";

const SECRET = "platform-staff-session-unit-test-secret";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

test("platform staff sessions are separate from owner sessions", () => {
  const token = createPlatformStaffSessionToken(ACCOUNT_ID, SECRET, 1_000);
  assert.deepEqual(verifyPlatformStaffSessionToken(token, SECRET, 1_001), {
    accountId: ACCOUNT_ID,
    expiresAt: 28_801_000,
  });
  const ownerToken = createOwnerSessionToken("platform-owner", SECRET, 1_000);
  assert.equal(verifyPlatformStaffSessionToken(ownerToken, SECRET, 1_001), null);
  assert.equal(verifyOwnerSessionToken(token, SECRET, 1_001), null);
});

test("platform staff sessions use an isolated cookie and expire", () => {
  const token = createPlatformStaffSessionToken(ACCOUNT_ID, SECRET, 1_000);
  assert.equal(
    readPlatformStaffSessionCookie(`${PLATFORM_STAFF_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`),
    token,
  );
  assert.equal(verifyPlatformStaffSessionToken(token, SECRET, 28_801_000), null);
});