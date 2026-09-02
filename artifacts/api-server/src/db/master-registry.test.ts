import assert from "node:assert/strict";
import test from "node:test";
import { mapTenantRegistryRecord } from "./master-registry";

test("maps display_name from the master registry without deriving it", () => {
  const record = mapTenantRegistryRecord(
    {
      id: "tenant-1",
      subdomain: "clientalpha",
      display_name: "ClientAlpha Holdings",
      database_name: "clientalpha_db",
      is_active: true,
    },
    [{ schema_name: "module_a" }],
  );

  assert.equal(record.customerName, "ClientAlpha Holdings");
  assert.notEqual(record.customerName, "Clientalpha");
});