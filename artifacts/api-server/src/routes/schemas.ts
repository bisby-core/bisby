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
const tenantSubdomain = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
  .refine((value: string) => value !== "www", "Reserved subdomain.");
const tenantDatabaseName = z
  .string()
  .regex(/^[a-z_][a-z0-9_$-]{0,62}$/);

export const HealthCheckResponse = z.object({ status: z.string() });
export const LoginBody = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});
export const LoginResponse = z.object({
  accountId: z.string(),
  tenantId: z.string(),
  role: z.enum(["staff", "client"]),
  requiresPasswordChange: z.boolean(),
});
export const GetCurrentUserResponse = LoginResponse;
export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(255),
  newPassword: z.string().min(12).max(255),
}).strict();
export const ChangePasswordResponse = z.object({
  status: z.literal("password_changed"),
  requiresPasswordChange: z.literal(false),
});
export const LogoutResponse = z.object({ authenticated: z.boolean() });
export const GetRouteAccessParams = z.object({ moduleKey, workspaceKey });
export const GetRouteAccessResponse = z.object({
  allowed: z.boolean(),
  tenantId: z.string(),
  subdomain: z.string(),
  moduleKey,
  workspaceKey,
});

export const OwnerLoginBody = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});

export const ProvisionTenantBody = z.object({
  subdomain: tenantSubdomain,
  displayName: z.string().trim().min(1).max(255),
  databaseName: tenantDatabaseName,
  adminUsername: z.string().trim().min(1).max(255),
  adminPassword: z.string().min(12).max(255),
});

export const OwnerTenantIdParams = z.object({
  tenantId: z.string().uuid(),
});

export const OwnerTenantAdministratorParams = z.object({
  tenantId: z.string().uuid(),
  administratorId: z.string().uuid(),
});

export const OwnerTenantModuleParams = z.object({
  tenantId: z.string().uuid(),
  moduleKey,
});

export const OwnerToggleBody = z.object({
  active: z.boolean(),
});

export const OwnerTenantAdministratorResetBody = z.object({
  username: z.string().trim().min(1).max(255),
  temporaryPassword: z.string().min(12).max(255),
}).strict();

export const OwnerTenantAdministratorCreateBody = z.object({
  username: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  temporaryPassword: z.string().min(12).max(255),
}).strict();
