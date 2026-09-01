import { z } from "zod";

const moduleKey = z.enum([
  "module_a",
  "module_b",
  "module_c",
  "module_d",
  "module_e",
  "module_f",
  "module_g",
  "module_h",
]);
const workspaceKey = z.string().regex(/^ws-(?:[1-9]|10)$/);

export const HealthCheckResponse = z.object({ status: z.string() });
export const LoginBody = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});
export const LoginResponse = z.object({
  accountId: z.string(),
  tenantId: z.string(),
  role: z.enum(["staff", "client"]),
});
export const GetCurrentUserResponse = LoginResponse;
export const LogoutResponse = z.object({ authenticated: z.boolean() });
export const GetRouteAccessParams = z.object({ moduleKey, workspaceKey });
export const GetRouteAccessResponse = z.object({
  allowed: z.boolean(),
  tenantId: z.string(),
  subdomain: z.string(),
  moduleKey,
  workspaceKey,
});
