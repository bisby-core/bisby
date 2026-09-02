import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCurrentUser,
  useGetTenantAdmin,
  useCreateManagedTenantAccount,
  useUpdateManagedTenantAccountStatus,
  useDeleteManagedTenantAccount,
  useUpdateManagedTenantAccountAccess,
  useResetManagedTenantAccountPassword,
  useLogout,
  getGetTenantAdminQueryKey,
  ModuleKey,
  type AuthenticatedLocalUser,
  type ManagedTenantAccountAccessRequestRole,
  type ManagedTenantAccountCreateRequestRole,
  type ManagedTenantAccount,
  type ManagedWorkspaceOption,
} from '@workspace/api-client-react';
import { ModuleWorkspaceControl, TenantWorkspaceControl } from '@/admin/WorkspaceControl';
import { TenantAdminStaffControl } from '@/admin/TenantAdminStaffControl';
import { StaffWorkspaceCard } from '@/admin/StaffWorkspaceAssignment';
import {
  ShieldAlert,
  UserPlus,
  X,
  Check,
  Power,
  Key,
  Activity,
  ArrowUpRight,
  Pencil,
} from 'lucide-react';
import {
  RouteFrame,
  StatusPill,
  getErrorStatus,
  LoadingState,
  useCustomerName,
} from '@/App';

export function canAccessAdministrationRoute(
  user: Pick<AuthenticatedLocalUser, 'role' | 'moduleKey'>,
  moduleLetter?: string,
): boolean {
  if (!moduleLetter) return user.role === 'tenant_admin';
  return (
    user.role === 'tenant_admin' ||
    (user.role === 'module_admin' &&
      user.moduleKey === `module_${moduleLetter.toLowerCase()}`)
  );
}

export function AdminControlPlane({ moduleLetter }: { moduleLetter?: string }) {
  const currentUser = useGetCurrentUser();
  const [, setLocation] = useLocation();
  const customerName = useCustomerName();
  const administrationTitle = moduleLetter
    ? `Module ${moduleLetter.toUpperCase()} Admin Controls`
    : `${customerName ?? 'Tenant'} Admin Controls`;

  useEffect(() => {
    if (currentUser.isError) {
      setLocation('/login');
    } else if (currentUser.data?.requiresPasswordChange) {
      setLocation('/change-password');
    }
  }, [currentUser.data?.requiresPasswordChange, currentUser.isError, setLocation]);

  if (currentUser.isLoading) {
    return (
      <RouteFrame eyebrow="BisBy / admin" title={administrationTitle}>
        <div className="mt-12 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.74)] p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 animate-pulse text-[hsl(var(--secondary-foreground))]" />
            <span className="font-mono text-xs uppercase tracking-[0.15em]">
              Verifying Access
            </span>
          </div>
        </div>
      </RouteFrame>
    );
  }

  if (currentUser.isError || !currentUser.data) {
    return null;
  }

  if (currentUser.data.requiresPasswordChange) {
    return null;
  }

  if (!canAccessAdministrationRoute(currentUser.data, moduleLetter)) {
    return (
      <RouteFrame eyebrow="BisBy / admin" title={administrationTitle}>
        <div className="mt-12 border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--card)/.72)] p-6 md:p-8">
          <div className="flex items-center gap-3 text-[hsl(var(--accent-foreground))]">
            <ShieldAlert className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-[0.15em]">
              Insufficient Privileges
            </span>
          </div>
          <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
            {moduleLetter
              ? `Only the Module ${moduleLetter.toUpperCase()} module admin or this tenant's tenant admin can access Module ${moduleLetter.toUpperCase()} Admin Controls.`
              : `Only this tenant's tenant admin can access ${customerName ?? 'Tenant'} Admin Controls.`}
          </p>
        </div>
      </RouteFrame>
    );
  }

  return <AdminControlPlaneContent title={administrationTitle} moduleLetter={moduleLetter} />;
}

function AdminControlPlaneContent({ title, moduleLetter }: { title: string; moduleLetter?: string }) {
  const adminData = useGetTenantAdmin();
  const [isCreating, setIsCreating] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'module-staff-workspace-assignment' | 'workspaces' | 'tenant-admin-staff' | 'tenant-admin-staff-workspace-assignment' | 'tenant-admin-staff-workspaces'>(
    moduleLetter ? 'workspaces' : 'accounts'
  );
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setActiveTab(moduleLetter ? 'workspaces' : 'accounts');
    setIsCreating(false);
  }, [moduleLetter]);

  const handleLogout = async () => {
    await logout.mutateAsync();
    queryClient.clear();
    setLocation('/login');
  };

  if (adminData.isLoading) {
    return (
      <RouteFrame eyebrow="BisBy / admin" title={title}>
        <LoadingState label="Organization data" />
      </RouteFrame>
    );
  }

  if (adminData.isError) {
    return (
      <RouteFrame eyebrow="BisBy / admin" title={title}>
        <div className="mt-12 border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--card)/.72)] p-6 md:p-8">
          <div className="flex items-center gap-3 text-[hsl(var(--accent-foreground))]">
            <ShieldAlert className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-[0.15em]">
              Error loading administration data
            </span>
          </div>
        </div>
      </RouteFrame>
    );
  }

  const data = adminData.data;
  if (!data?.currentUser) return null;
  const role = data.currentUser.role;
  const selectedTab = activeTab;

  const isTenantAdminAtRoot = role === 'tenant_admin' && !moduleLetter;
  const isTenantAdminAtModule = role === 'tenant_admin' && !!moduleLetter;
  const isModuleAdmin = role === 'module_admin';

  const activeModuleKey = moduleLetter ? `module_${moduleLetter.toLowerCase()}` as ModuleKey : null;

  const selectedModule =
    isTenantAdminAtRoot
      ? activeModule && data.enabledModules.includes(activeModule)
        ? activeModule
        : data.enabledModules[0] ?? null
      : activeModuleKey ?? data.currentUser.moduleKey;

  const filteredUsers = data.users.filter((u) => {
    if (!selectedModule || u.moduleKey !== selectedModule) return false;
    if (isTenantAdminAtRoot) return u.role === 'module_admin';
    return u.role === 'module_staff';
  });

  const pageTitle = isTenantAdminAtRoot && data.customerName
    ? `${data.customerName} Admin Controls`
    : title;

  const pageDescription = isTenantAdminAtRoot
    ? 'Manage module admin accounts, staff, and public entries.'
    : `Module ${selectedModule?.replace('module_', '').toUpperCase()} Admin Controls. Operations and access control.`;

  const tabs = [];
  if (isTenantAdminAtRoot) {
    tabs.push({ id: 'accounts', label: 'Accounts' });
    tabs.push({ id: 'tenant-admin-staff', label: `${data.customerName} Admin Staff` });
    tabs.push({ id: 'tenant-admin-staff-workspace-assignment', label: `${data.customerName} Admin Staff Workspace Assignment` });
    tabs.push({ id: 'tenant-admin-staff-workspaces', label: `${data.customerName} Admin Staff Workspaces` });
    tabs.push({ id: 'workspaces', label: 'Public Entries' });
  } else {
    tabs.push({ id: 'workspaces', label: 'Module Workspaces' });
    tabs.push({ id: 'module-staff-workspace-assignment', label: 'Module Staff Workspace Assignment' });
  }

  return (
    <RouteFrame
      eyebrow="BisBy / admin"
      title={pageTitle}
    >
      <div className="mt-12 flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em]">
            {isTenantAdminAtRoot ? 'Accounts' : `Module ${selectedModule?.replace('module_', '').toUpperCase()} Admin Controls`}
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {pageDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={moduleLetter ? `/module/${moduleLetter.toLowerCase()}/home` : '/tenant/home'}
            className="inline-flex items-center gap-2 border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85"
            data-testid={moduleLetter ? `link-module-${moduleLetter.toLowerCase()}-home` : 'link-tenant-home'}
          >
            {moduleLetter
              ? `Module ${moduleLetter.toUpperCase()} Home`
              : `${data.customerName} Home`}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          {selectedModule && isTenantAdminAtRoot && (
            <Link
              href={`/${selectedModule.replace('module_', '')}/admin`}
              className="inline-flex items-center gap-2 border border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]"
              data-testid="link-open-selected-module"
            >
              Open Module {selectedModule.replace('module_', '').toUpperCase()}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
          {selectedTab === 'accounts' && !isCreating && selectedModule && isTenantAdminAtRoot && (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85"
              data-testid="button-create-account-start"
            >
              <UserPlus className="h-3.5 w-3.5" /> Create Account
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={logout.isPending}
            className="inline-flex items-center gap-2 border border-[hsl(var(--border))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            data-testid="button-admin-logout"
          >
            {logout.isPending ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-[hsl(var(--border))] pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id as any); setIsCreating(false); }}
            className={`border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              activeTab === tab.id
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--foreground))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
            }`}
            data-testid={`tab-admin-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selectedTab === 'tenant-admin-staff' && isTenantAdminAtRoot ? (
        <div className="mt-8"><TenantAdminStaffControl section="staff" customerName={data.customerName} /></div>
      ) : selectedTab === 'tenant-admin-staff-workspace-assignment' && isTenantAdminAtRoot ? (
        <div className="mt-8"><TenantAdminStaffControl section="assignments" customerName={data.customerName} /></div>
      ) : selectedTab === 'tenant-admin-staff-workspaces' && isTenantAdminAtRoot ? (
        <div className="mt-8"><TenantAdminStaffControl section="workspaces" customerName={data.customerName} /></div>
      ) : selectedTab === 'module-staff-workspace-assignment' && !isTenantAdminAtRoot ? (
        <div className="mt-8">
          <div className="border-b border-[hsl(var(--border))] pb-6 flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm uppercase tracking-[0.15em]">
                Module Staff Workspace Assignment
              </h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Assign module staff to one or more Module {selectedModule?.replace('module_', '').toUpperCase()} workspaces.
              </p>
            </div>
            {!isTenantAdminAtModule && (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85"
                data-testid="button-create-module-staff-start"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add New
              </button>
            )}
          </div>
          {isCreating && (
            <div className="mt-8">
              <CreateModuleStaffCard
                workspaces={data.workspaces}
                moduleKey={selectedModule!}
                onClose={() => setIsCreating(false)}
              />
            </div>
          )}
          <div className="mt-8 grid gap-4">
            {filteredUsers.map((user) => (
              <ModuleStaffWorkspaceAssignment
                key={user.id}
                user={user}
                workspaces={data.workspaces}
                readOnly={isTenantAdminAtModule}
              />
            ))}
            {filteredUsers.length === 0 && (
              <div className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.4)] p-8 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">
                  No module staff available for workspace assignment
                </p>
              </div>
            )}
          </div>
        </div>
      ) : selectedTab === 'accounts' && isTenantAdminAtRoot ? (
  <>
    {isTenantAdminAtRoot && (
      <div className="mb-8 mt-4 flex flex-wrap gap-2">
        {data.enabledModules.map((moduleKey) => {
          const letter = moduleKey.replace('module_', '');
          const isSelected = selectedModule === moduleKey;
          return (
            <button
              type="button"
              key={moduleKey}
              onClick={() => {
                setActiveModule(moduleKey);
                setIsCreating(false);
              }}
              className={`border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                isSelected
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--foreground))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
              }`}
              data-testid={`tab-admin-module-${letter}`}
            >
              Module {letter.toUpperCase()}
            </button>
          );
        })}
      </div>
    )}

    {isCreating && selectedModule && (
      <div className="mt-8 border border-[hsl(var(--primary))] bg-[hsl(var(--card)/.76)] p-6 shadow-sm md:p-8">
        <CreateAccountForm
          onCancel={() => setIsCreating(false)}
          currentUserRole={role}
          activeModule={selectedModule}
          workspaces={data.workspaces}
        />
      </div>
    )}

    <div className="mt-8 grid gap-4">
      {filteredUsers.map((user) => (
        <UserCard key={user.id} user={user} currentUserRole={role} workspaces={data.workspaces} readOnly={isTenantAdminAtModule} />
      ))}
      {filteredUsers.length === 0 && (
        <div className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.4)] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">
            No managed accounts for this module
          </p>
        </div>
      )}
    </div>
  </>
) : (
  <div className="mt-8">
    {isTenantAdminAtRoot ? <TenantWorkspaceControl /> : <ModuleWorkspaceControl readOnly={isTenantAdminAtModule} moduleKey={selectedModule || undefined} />}
  </div>
)}
    </RouteFrame>
  );
}

function CreateModuleStaffCard({
  workspaces,
  moduleKey,
  onClose,
}: {
  workspaces: ManagedWorkspaceOption[];
  moduleKey: ModuleKey;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const createAccount = useCreateManagedTenantAccount();
  const availableWorkspaces = workspaces.filter((w) => w.moduleKey === moduleKey);

  const handleCreate = async (data: { username: string; displayName: string; temporaryPassword: string; workspaceKeys: string[] }) => {
    try {
      await createAccount.mutateAsync({
        data: {
          username: data.username,
          displayName: data.displayName,
          temporaryPassword: data.temporaryPassword,
          role: 'module_staff',
          moduleKey,
          workspaceKeys: data.workspaceKeys,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
      onClose();
    } catch {}
  };

  return (
    <StaffWorkspaceCard
      mode="create"
      roleLabel={`Module ${moduleKey.replace('module_', '').toUpperCase()} Staff`}
      workspaces={availableWorkspaces}
      onClose={onClose}
      onCreate={handleCreate}
      pending={createAccount.isPending}
      error={createAccount.isError}
      testIdPrefix="module-staff-workspace-assignment"
    />
  );
}

function ModuleStaffWorkspaceAssignment({
  user,
  workspaces,
  readOnly,
}: {
  user: ManagedTenantAccount;
  workspaces: ManagedWorkspaceOption[];
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const updateAccess = useUpdateManagedTenantAccountAccess();
  const updateStatus = useUpdateManagedTenantAccountStatus();
  const deleteUser = useDeleteManagedTenantAccount();
  const availableWorkspaces = workspaces.filter((workspace) => workspace.moduleKey === user.moduleKey);

  const handleSave = async (workspaceKeys: string[]) => {
    try {
      await updateAccess.mutateAsync({
        accountId: user.id,
        data: { role: 'module_staff', workspaceKeys },
      });
      await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
    } catch {}
  };

  const handleToggleStatus = async () => {
    try {
      await updateStatus.mutateAsync({
        accountId: user.id,
        data: { active: !user.isActive },
      });
      await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
    } catch {}
  };

  const handleDelete = async () => {
    try {
      await deleteUser.mutateAsync({ accountId: user.id });
      await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
    } catch {}
  };

  const isPending = updateAccess.isPending || updateStatus.isPending || deleteUser.isPending;
  const isError = updateAccess.isError || updateStatus.isError || deleteUser.isError;

  return (
    <StaffWorkspaceCard
      mode="edit"
      defaultDisplayName={user.displayName}
      defaultUsername={user.username}
      roleLabel={`Module ${user.moduleKey?.replace('module_', '').toUpperCase()} Staff`}
      workspaces={availableWorkspaces}
      defaultWorkspaceKeys={user.workspaceKeys}
      isActive={user.isActive}
      readOnly={readOnly}
      pending={isPending}
      error={isError}
      onSave={handleSave}
      onSuspend={handleToggleStatus}
      onReactivate={handleToggleStatus}
      onDelete={handleDelete}
      testIdPrefix="module-staff-workspace-assignment"
    />
  );
}

function UserCard({
  user,
  currentUserRole,
  workspaces,
  readOnly,
}: {
  user: ManagedTenantAccount;
  currentUserRole: string;
  workspaces: ManagedWorkspaceOption[];
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const updateStatus = useUpdateManagedTenantAccountStatus();
  const [activeForm, setActiveForm] = useState<'reset' | 'edit' | null>(null);

  const handleToggleStatus = async () => {
    try {
      await updateStatus.mutateAsync({
        accountId: user.id,
        data: { active: !user.isActive },
      });
      queryClient.invalidateQueries({
        queryKey: getGetTenantAdminQueryKey(),
      });
    } catch {}
  };

  const canEdit =
    !readOnly &&
    currentUserRole === 'module_admin' &&
    (user.role === 'module_staff' || user.role === 'client');
  const canToggleStatus = canEdit;
  const canResetPassword =
    canEdit || (!readOnly && currentUserRole === 'tenant_admin' && user.role === 'module_admin');

  return (
    <div
      className={`flex flex-col gap-4 border p-5 transition-colors md:p-6 ${
        user.isActive
          ? 'border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)]'
          : 'border-[hsl(var(--border)/.5)] bg-[hsl(var(--card)/.3)] opacity-75'
      }`}
      data-testid={`card-user-${user.username}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">
              {user.displayName}
            </span>
            <StatusPill tone={user.isActive ? 'good' : 'neutral'}>
              {user.isActive ? 'active' : 'inactive'}
            </StatusPill>
            {user.requiresPasswordChange && (
              <StatusPill tone="warn">pending password</StatusPill>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            <span className="text-[hsl(var(--foreground))]">
              {user.username}
            </span>
            <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
            <span>{user.role.replace('_', ' ')}</span>
            <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
            <span>
              Mod {user.moduleKey.replace('module_', '').toUpperCase()}
            </span>
            {user.workspaceKeys.length > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
                <span>{user.workspaceKeys.join(', ')}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === 'edit' ? null : 'edit')}
              disabled={!user.isActive}
              className={`border px-3 py-2 transition-colors ${
                activeForm === 'edit'
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--foreground))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-40'
              }`}
              title="Edit Access"
              data-testid={`button-edit-access-${user.username}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canResetPassword && (
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === 'reset' ? null : 'reset')}
              disabled={!user.isActive}
              className={`border px-3 py-2 transition-colors ${
                activeForm === 'reset'
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--foreground))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-40'
              }`}
              title="Reset Password"
              data-testid={`button-reset-password-${user.username}`}
            >
              <Key className="h-4 w-4" />
            </button>
          )}
          {canToggleStatus && (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={updateStatus.isPending}
              className={`border px-3 py-2 transition-colors ${
                user.isActive
                  ? 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--secondary))] hover:text-[hsl(var(--secondary))]'
              }`}
              title={user.isActive ? 'Deactivate Account' : 'Activate Account'}
              data-testid={`button-toggle-status-${user.username}`}
            >
              <Power className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {activeForm === 'reset' && (
        <PasswordResetForm
          accountId={user.id}
          onComplete={() => setActiveForm(null)}
          onCancel={() => setActiveForm(null)}
        />
      )}
      {activeForm === 'edit' && canEdit && (
        <EditAccountForm
          user={user}
          workspaces={workspaces}
          onComplete={() => setActiveForm(null)}
          onCancel={() => setActiveForm(null)}
        />
      )}
    </div>
  );
}

function PasswordResetForm({
  accountId,
  onComplete,
  onCancel,
}: {
  accountId: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const resetPassword = useResetManagedTenantAccountPassword();
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await resetPassword.mutateAsync({
        accountId,
        data: { temporaryPassword },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetTenantAdminQueryKey(),
      });
      onComplete();
    } catch {}
  };

  const errorStatus = getErrorStatus(resetPassword.error);

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 border-t border-[hsl(var(--border))] pt-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <h4 className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--foreground))]">
          Reset Temporary Password
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            New Temporary Password
            <input
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              minLength={8}
              required
              className="mt-2 w-full border border-[hsl(var(--input))] bg-[hsl(var(--background)/.5)] px-3 py-2 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
              data-testid="input-reset-password"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={resetPassword.isPending || temporaryPassword.length < 8}
          className="h-[38px] bg-[hsl(var(--primary))] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] hover:opacity-85 disabled:opacity-50"
          data-testid="button-submit-reset-password"
        >
          {resetPassword.isPending ? 'Resetting...' : 'Set Password'}
        </button>
      </div>
      {resetPassword.isError && (
        <p className="mt-3 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm text-[hsl(var(--accent-foreground))]">
          {errorStatus === 400
            ? 'Password does not meet requirements.'
            : 'Could not reset password.'}
        </p>
      )}
    </form>
  );
}

function EditAccountForm({
  user,
  workspaces,
  onComplete,
  onCancel,
}: {
  user: ManagedTenantAccount;
  workspaces: ManagedWorkspaceOption[];
  onComplete: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const updateAccess = useUpdateManagedTenantAccountAccess();

  const [role, setRole] = useState<ManagedTenantAccountAccessRequestRole>(
    user.role === 'client' ? 'client' : 'module_staff',
  );
  const [workspaceKeys, setWorkspaceKeys] = useState<string[]>(user.workspaceKeys);

  const availableWorkspaces = workspaces.filter((w) => w.moduleKey === user.moduleKey);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateAccess.mutateAsync({
        accountId: user.id,
        data: {
          role,
          workspaceKeys,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetTenantAdminQueryKey(),
      });
      onComplete();
    } catch {}
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-[hsl(var(--border))] pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--foreground))]">
          Edit Access
        </h4>
        <button type="button" onClick={onCancel} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))] mb-6">
        Account Role
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as ManagedTenantAccountAccessRequestRole)
          }
          className="mt-2 block w-full max-w-sm border border-[hsl(var(--input))] bg-[hsl(var(--background)/.5)] px-3 py-2 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
          data-testid={`select-edit-role-${user.username}`}
        >
          <option value="module_staff">Module Staff</option>
          <option value="client">Client</option>
        </select>
      </label>

      <div className="mb-6">
        <span className="mb-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Workspace Access (select at least one)
        </span>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {availableWorkspaces.map((ws) => (
            <label
              key={ws.workspaceKey}
              className={`flex cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                workspaceKeys.includes(ws.workspaceKey)
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.05)]'
                  : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--card)/.5)]'
              }`}
            >
              <input
                type="checkbox"
                checked={workspaceKeys.includes(ws.workspaceKey)}
                onChange={(e) => {
                  if (e.target.checked) setWorkspaceKeys([...workspaceKeys, ws.workspaceKey]);
                  else setWorkspaceKeys(workspaceKeys.filter((w) => w !== ws.workspaceKey));
                }}
                className="h-3 w-3 accent-[hsl(var(--primary))]"
                data-testid={`checkbox-edit-workspace-${ws.workspaceKey}`}
              />
              <div className="flex flex-col overflow-hidden">
                <span className="font-mono text-xs uppercase text-[hsl(var(--foreground))]">
                  {ws.workspaceKey}
                </span>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] truncate w-full" title={ws.displayName}>
                  {ws.displayName}
                </span>
              </div>
            </label>
          ))}
          {availableWorkspaces.length === 0 && (
            <div className="col-span-2 text-sm text-[hsl(var(--muted-foreground))] p-2 bg-[hsl(var(--background)/.5)] border border-[hsl(var(--border))]">
              No live workspaces available.
            </div>
          )}
        </div>
      </div>

      {updateAccess.isError && (
        <p className="mb-4 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm text-[hsl(var(--accent-foreground))]">
          Could not update account access.
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
        <button
          type="submit"
          disabled={updateAccess.isPending || workspaceKeys.length === 0}
          className="bg-[hsl(var(--primary))] px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
          data-testid={`button-submit-edit-${user.username}`}
        >
          {updateAccess.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function CreateAccountForm({
  onCancel,
  currentUserRole,
  activeModule,
  workspaces,
}: {
  onCancel: () => void;
  currentUserRole: string;
  activeModule: ModuleKey;
  workspaces: ManagedWorkspaceOption[];
}) {
  const queryClient = useQueryClient();
  const createAccount = useCreateManagedTenantAccount();

  const isTenantAdmin = currentUserRole === 'tenant_admin';

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<ManagedTenantAccountCreateRequestRole>(
    isTenantAdmin ? 'module_admin' : 'client',
  );
  const [workspaceKeys, setWorkspaceKeys] = useState<string[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const availableWorkspaces = workspaces.filter((w) => w.moduleKey === activeModule);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await createAccount.mutateAsync({
        data: {
          username,
          displayName,
          role,
          moduleKey: activeModule,
          workspaceKeys: isTenantAdmin ? [] : workspaceKeys,
          temporaryPassword,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetTenantAdminQueryKey(),
      });
      onCancel();
    } catch {}
  };

  const errorStatus = getErrorStatus(createAccount.error);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
        <div className="flex items-center gap-3 text-[hsl(var(--foreground))]">
          <div className="flex h-8 w-8 items-center justify-center bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">
            <UserPlus className="h-4 w-4" />
          </div>
          <h3 className="font-mono text-sm uppercase tracking-[0.15em]">
            New {isTenantAdmin ? 'module admin' : role.replace('_', ' ')}
          </h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
            data-testid="input-create-username"
          />
        </label>
        <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Display Name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
            data-testid="input-create-display-name"
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {isTenantAdmin ? (
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            Module Assignment
            <div className="mt-2 w-full border border-[hsl(var(--input))] bg-[hsl(var(--background)/.5)] px-3 py-3 font-mono text-sm text-[hsl(var(--muted-foreground))] opacity-75">
              Module {activeModule.replace('module_', '').toUpperCase()}
            </div>
          </label>
        ) : (
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            Account Role
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as ManagedTenantAccountCreateRequestRole)
              }
              className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
              data-testid="select-create-role"
            >
              <option value="client">Client</option>
            </select>
          </label>
        )}

        <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Temporary Password
          <input
            type="password"
            value={temporaryPassword}
            onChange={(e) => setTemporaryPassword(e.target.value)}
            minLength={8}
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
            data-testid="input-create-password"
          />
        </label>
      </div>

      {!isTenantAdmin && (
        <div>
          <span className="mb-4 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            Workspace access (select at least one)
          </span>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {availableWorkspaces.map((ws) => (
              <label
                key={ws.workspaceKey}
                className={`flex cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                  workspaceKeys.includes(ws.workspaceKey)
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.05)]'
                    : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--card)/.5)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={workspaceKeys.includes(ws.workspaceKey)}
                  onChange={(e) => {
                    if (e.target.checked)
                      setWorkspaceKeys([...workspaceKeys, ws.workspaceKey]);
                    else setWorkspaceKeys(workspaceKeys.filter((w) => w !== ws.workspaceKey));
                  }}
                  className="h-3 w-3 accent-[hsl(var(--primary))]"
                  data-testid={`checkbox-workspace-${ws.workspaceKey}`}
                />
                <div className="flex flex-col overflow-hidden">
                  <span className="font-mono text-xs uppercase text-[hsl(var(--foreground))]">
                    {ws.workspaceKey}
                  </span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] truncate w-full" title={ws.displayName}>
                    {ws.displayName}
                  </span>
                </div>
              </label>
            ))}
            {availableWorkspaces.length === 0 && (
              <div className="col-span-2 text-sm text-[hsl(var(--muted-foreground))] p-2 bg-[hsl(var(--background)/.5)] border border-[hsl(var(--border))]">
                No live workspaces available.
              </div>
            )}
          </div>
        </div>
      )}

      {createAccount.isError && (
        <p className="border-l-2 border-[hsl(var(--accent))] pl-3 text-sm leading-6 text-[hsl(var(--accent-foreground))]">
          {errorStatus === 409
            ? 'Invalid account data or username already exists.'
            : 'Could not create account.'}
        </p>
      )}

      <div className="flex justify-end border-t border-[hsl(var(--border))] pt-6">
        <button
          type="submit"
          disabled={
            createAccount.isPending ||
            (!isTenantAdmin && workspaceKeys.length === 0)
          }
          className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
          data-testid="button-submit-create-account"
        >
          <Check className="h-3.5 w-3.5" />
          {createAccount.isPending ? 'Creating...' : 'Create Account'}
        </button>
      </div>
    </form>
  );
}
