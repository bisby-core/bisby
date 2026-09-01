import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearOwnerSessionCookie,
  createOwnerSession,
  getOwnerCredentials,
  ownerSessionFromRequest,
} from "./session";

test("reads owner credentials only from environment variables", () => {
  assert.deepEqual(
    getOwnerCredentials({ BISBY_OWNER_USERNAME: "owner", BISBY_OWNER_PASSWORD: "password" }),
    { username: "owner", password: "password" },
  );
  assert.equal(getOwnerCredentials({ BISBY_OWNER_USERNAME: "owner" }), null);
});

test("creates and validates an owner-only signed session", () => {
  const token = createOwnerSession("owner", "test-secret");
  const session = ownerSessionFromRequest(`other=value; bisby_owner_session=${token}`, "test-secret");
  assert.equal(session?.username, "owner");
  assert.equal(ownerSessionFromRequest(`bisby_owner_session=${token}x`, "test-secret"), null);
  assert.match(clearOwnerSessionCookie(true), /HttpOnly; SameSite=Strict; Max-Age=0; Secure/);
});
