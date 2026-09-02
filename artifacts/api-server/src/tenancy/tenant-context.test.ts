import assert from "node:assert/strict";
import test from "node:test";
import { GetCustomerContextResponse } from "../routes/schemas";
import { toTenantContext } from "./tenant-context";

test("maps the stored registry display name into customer context", () => {
  const context = toTenantContext({
    tenantId: "tenant-1",
    subdomain: "clientalpha",
    customerName: "ClientAlpha Holdings",
    enabledModules: ["module_a"],
  });

  assert.equal(context.customerName, "ClientAlpha Holdings");
  assert.equal(context.subdomain, "clientalpha");
});

test("customer context response exposes only customer-safe identity", () => {
  assert.deepEqual(
    GetCustomerContextResponse.parse({
      customerName: "Design",
      subdomain: "design",
    }),
    { customerName: "Design", subdomain: "design" },
  );
  assert.throws(() =>
    GetCustomerContextResponse.parse({
      customerName: "",
      subdomain: "design",
    }),
  );
});