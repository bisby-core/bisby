import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("hashes and verifies a local password", async () => {
  const hash = await hashPassword("password123");

  assert.notEqual(hash, "password123");
  assert.match(hash, /^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$/);
  assert.equal(await verifyPassword("password123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});