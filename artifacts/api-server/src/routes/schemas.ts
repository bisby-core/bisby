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
const workspaceKey = z.string().regex(/^ws-[1-9][0-9]*$/);
const tenantWorkspaceKey = z.string().regex(/^tws-[1-9][0-9]*$/);
const workspaceType = z.enum(["normal", "public_information", "contact_us"]);
const workspaceAccessLevel = z.enum([
  "active",
  "sign_only",
  "view_only",
  "not_available",
]);
const localAccountRole = z.enum(["tenant_admin", "module_admin", "module_staff", "client"]);
const tenantSubdomain = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
  .refine((value: string) => value !== "www", "Reserved subdomain.");
const tenantDatabaseName = z
  .string()
  .regex(/^[a-z_][a-z0-9_$-]{0,62}$/);
const simplePassword = z.string().min(8).max(255);

export const HealthCheckResponse = z.object({ status: z.string() });
export const LoginBody = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});
export const LoginResponse = z.object({
  accountId: z.string(),
  tenantId: z.string(),
  username: z.string(),
  role: localAccountRole,
  moduleKey: moduleKey.nullable(),
  workspaceKeys: z.array(workspaceKey),
  requiresPasswordChange: z.boolean(),
});
export const GetCurrentUserResponse = LoginResponse;
export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(255),
  newPassword: simplePassword,
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
export const GetContentAccessParams = z.object({
  moduleKey,
  workspaceKey,
  nodeType: z.enum(["page", "tab", "card"]),
  nodeKey: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,126})$/),
});
export const GetContentAccessResponse = z.object({
  allowed: z.boolean(),
  moduleKey,
  workspaceKey,
  nodeType: z.enum(["page", "tab", "card"]),
  nodeKey: z.string(),
  accessLevel: workspaceAccessLevel,
  canView: z.boolean(),
  canSign: z.boolean(),
  canEdit: z.boolean(),
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
  adminPassword: simplePassword,
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
  currentUsername: z.string().trim().min(1).max(255),
  newUsername: z.string().trim().min(1).max(255),
  temporaryPassword: simplePassword,
}).strict();

export const OwnerTenantAdministratorCreateBody = z.object({
  username: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  temporaryPassword: simplePassword,
}).strict();

export const TenantAdminUserParams = z.object({
  accountId: z.string().uuid(),
});

export const TenantAdminUserCreateBody = z.object({
  username: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  role: z.enum(["module_admin", "module_staff", "client"]),
  moduleKey,
  workspaceKeys: z.array(workspaceKey).default([]),
  temporaryPassword: simplePassword,
}).strict();

export const TenantAdminUserAccessBody = z.object({
  role: z.enum(["module_staff", "client"]),
  workspaceKeys: z.array(workspaceKey).min(1),
}).strict();

export const TenantAdminUserResetBody = z.object({
  temporaryPassword: simplePassword,
}).strict();

export const TenantAdminUserStatusBody = z.object({
  active: z.boolean(),
}).strict();

export const ModuleWorkspaceParams = z.object({
  workspaceKey,
});

export const ModuleWorkspaceCreateBody = z.object({
  displayName: z.string().trim().min(1).max(255),
}).strict();

export const ModuleWorkspaceAccessBody = z.object({
  controls: z.array(
    z.object({
      nodeId: z.string().uuid(),
      accessLevel: workspaceAccessLevel,
    }).strict(),
  ).min(1).max(250),
}).strict();
export const TenantWorkspaceParams = z.object({ workspaceKey: tenantWorkspaceKey });
export const WorkspaceMetadataBody = z.object({
  displayName: z.string().trim().min(1).max(255),
  isActive: z.boolean(),
  workspaceType,
  publicVisible: z.boolean(),
  contactEnabled: z.boolean(),
}).strict();
export const OwnerWorkspaceParams = z.object({ workspaceKey: z.string().regex(/^pws-[1-9][0-9]*$/) });
export const WorkspaceAccessBody = z.object({ controls: z.array(z.object({ nodeId: z.string().uuid(), accessLevel: workspaceAccessLevel }).strict()).min(1).max(250) }).strict();
