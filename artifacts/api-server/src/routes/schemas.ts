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
const tenantAdminStaffWorkspaceKey = z.string().regex(/^tasw-[1-9][0-9]*$/);
const localWorkspaceKey = z.union([workspaceKey, tenantAdminStaffWorkspaceKey]);
const tenantWorkspaceKey = z.string().regex(/^tws-[1-9][0-9]*$/);
const workspaceType = z.enum(["normal", "public_information", "contact_us"]);
const workspaceAccessLevel = z.enum([
  "active",
  "sign_only",
  "view_only",
  "not_available",
]);
const localAccountRole = z.enum(["tenant_admin", "module_admin", "module_staff", "client", "tenant_admin_staff"]);
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
  workspaceKeys: z.array(localWorkspaceKey),
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
export const GetCustomerContextResponse = z.object({
  customerName: z.string().min(1),
  subdomain: z.string(),
});
export const GetRouteAccessParams = z.object({ moduleKey, workspaceKey });
export const GetRouteAccessResponse = z.object({
  allowed: z.boolean(),
  tenantId: z.string(),
  customerName: z.string().min(1),
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

export const OwnerTenantAdminParams = z.object({
  tenantId: z.string().uuid(),
  tenantAdminId: z.string().uuid(),
});

export const OwnerTenantModuleParams = z.object({
  tenantId: z.string().uuid(),
  moduleKey,
});

export const OwnerToggleBody = z.object({
  active: z.boolean(),
});

export const OwnerTenantAdminResetBody = z.object({
  currentUsername: z.string().trim().min(1).max(255),
  newUsername: z.string().trim().min(1).max(255),
  temporaryPassword: simplePassword,
}).strict();

export const OwnerTenantAdminCreateBody = z.object({
  username: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  temporaryPassword: simplePassword,
}).strict();

const platformWorkspaceKey = z.string().regex(/^pws-[1-9][0-9]*$/);
const platformStaffWorkspaceKeys = z.array(platformWorkspaceKey).min(1).max(250)
  .refine((keys) => new Set(keys).size === keys.length, "Workspace assignments must be unique.");
export const OwnerPlatformStaffParams = z.object({
  platformStaffId: z.string().uuid(),
});
export const OwnerPlatformStaffCreateBody = z.object({
  username: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  temporaryPassword: simplePassword,
  workspaceKeys: platformStaffWorkspaceKeys,
}).strict();
export const OwnerPlatformStaffWorkspacesBody = z.object({
  workspaceKeys: platformStaffWorkspaceKeys,
}).strict();
export const OwnerPlatformStaffResetBody = z.object({
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
export const TenantAdminStaffWorkspaceParams = z.object({ workspaceKey: tenantAdminStaffWorkspaceKey });
export const TenantAdminStaffCreateBody = z.object({
  username: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  temporaryPassword: simplePassword,
  workspaceKeys: z.array(tenantAdminStaffWorkspaceKey).min(1).max(250)
    .refine((keys) => new Set(keys).size === keys.length, "Workspace assignments must be unique."),
}).strict();
export const TenantAdminStaffAccessBody = z.object({
  workspaceKeys: z.array(tenantAdminStaffWorkspaceKey).min(1),
}).strict();
export const TenantAdminStaffRouteAccessParams = z.object({ workspaceKey: tenantAdminStaffWorkspaceKey });

export const ModuleWorkspaceParams = z.object({
  workspaceKey,
});

export const ModuleWorkspaceControlQuery = z.object({
  moduleKey: moduleKey.optional(),
}).strict();

const workspaceContentNodeType = z.enum(["page", "tab", "card"]);
const workspaceContentNodeKey = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,126})$/);

export const ModuleWorkspaceHierarchyParams = z.object({
  nodeType: workspaceContentNodeType,
  nodeKey: workspaceContentNodeKey,
});

export const ModuleWorkspaceHierarchyCreateBody = z.object({
  type: workspaceContentNodeType,
  key: workspaceContentNodeKey,
  displayName: z.string().trim().min(1).max(255),
  sortOrder: z.number().int(),
  parentType: workspaceContentNodeType.nullable(),
  parentKey: workspaceContentNodeKey.nullable(),
}).strict();

export const ModuleWorkspaceHierarchyUpdateBody = z.object({
  key: workspaceContentNodeKey,
  displayName: z.string().trim().min(1).max(255),
  sortOrder: z.number().int(),
  parentType: workspaceContentNodeType.nullable(),
  parentKey: workspaceContentNodeKey.nullable(),
}).strict();

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
export const TenantAdminStaffWorkspaceCreateBody = WorkspaceMetadataBody;
export const TenantAdminStaffWorkspaceUpdateBody = WorkspaceMetadataBody;
export const OwnerWorkspaceParams = z.object({ workspaceKey: z.string().regex(/^pws-[1-9][0-9]*$/) });
export const WorkspaceAccessBody = z.object({ controls: z.array(z.object({ nodeId: z.string().uuid(), accessLevel: workspaceAccessLevel }).strict()).min(1).max(250) }).strict();
