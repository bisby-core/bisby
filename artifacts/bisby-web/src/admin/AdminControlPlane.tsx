import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCurrentUser,
  useGetTenantAdministration,
  useCreateManagedTenantAccount,
  useUpdateManagedTenantAccountStatus,
  useUpdateManagedTenantAccountAccess,
  useResetManagedTenantAccountPassword,
  useLogout,
  getGetTenantAdministrationQueryKey,
  ModuleKey,
  type ManagedTenantAccountAccessRequestRole,
  type ManagedTenantAccountCreateRequestRole,
  type ManagedTenantAccount,
  type ManagedWorkspaceOption,
} from '@workspace/api-client-react';
import { ModuleWorkspaceControl, TenantWorkspaceControl } from '@/admin/WorkspaceControl';
import {
  ShieldAlert,
  UserPlus,
  X,
  Check,
  Power,
  Key,
  Activity,
  Pencil,
} from 'lucide-react';
import {
  RouteFrame,
  StatusPill,
  getErrorStatus,
  LoadingState,
  tenantNameFromHostname,
} from '@/App';

export function AdminControlPlane() {
  const currentUser = useGetCurrentUser();
  const [, setLocation] = useLocation();
  const tenantName = tenantNameFromHostname(window.location.hostname);
  const administrationTitle = tenantName
    ? `${tenantName} Administration`
    : 'Tenant Administration';

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

  if (
    currentUser.data.role !== 'tenant_admin' &&
    currentUser.data.role !== 'module_admin'
  ) {
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
            You do not have administration rights for this tenant.
          </p>
        </div>
      </RouteFrame>
    );
  }

  return <AdminControlPlaneContent title={administrationTitle} />;
}

function AdminControlPlaneContent({ title }: { title: string }) {
  const adminData = useGetTenantAdministration();
  const [isCreating, setIsCreating] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'workspaces'>('accounts');
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout.mutateAsync();
    queryClient.clear();
    setLocation('/login');
  };

  if (adminData.isLoading) {
    return (
      <RouteFrame eyebrow="BisBy / admin" title={title}>
        <LoadingState label="Tenant Data" />
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
  const selectedModule =
    role === 'tenant_admin'
      ? activeModule && data.enabledModules.includes(activeModule)
        ? activeModule
        : data.enabledModules[0] ?? null
      : data.currentUser.moduleKey;

  const filteredUsers = data.users.filter((u) => {
    if (!selectedModule || u.moduleKey !== selectedModule) return false;
    if (role === 'tenant_admin') return u.role === 'module_admin';
    return u.role === 'module_staff' || u.role === 'client';
  });

  return (
    <RouteFrame eyebrow="BisBy / admin" title={title}>
      <div className="mt-12 flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em]">
            {role === 'tenant_admin' ? 'Managed Accounts' : 'Module Administration'}
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {role === 'tenant_admin'
              ? 'Global scope. Managing module administrators.'
              : `Module ${data.currentUser.moduleKey
                  ?.replace('module_', '')
                  .toUpperCase()} scope. Operations and access control.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedTab === 'accounts' && !isCreating && selectedModule && (
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
  <button
    type="button"
    onClick={() => { setActiveTab('accounts'); setIsCreating(false); }}
    className={`border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
      activeTab === 'accounts'
        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--foreground))]'
        : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
    }`}
    data-testid="tab-admin-accounts"
  >
    Accounts
  </button>
  <button
    type="button"
    onClick={() => { setActiveTab('workspaces'); setIsCreating(false); }}
    className={`border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
      activeTab === 'workspaces'
        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--foreground))]'
        : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
    }`}
    data-testid="tab-admin-workspaces"
  >
    {role === 'tenant_admin' ? 'Tenant Workspaces' : 'Workspace Control'}
  </button>
</div>

      {selectedTab === 'accounts' ? (
  <>
    {role === 'tenant_admin' && (
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
        <UserCard key={user.id} user={user} currentUserRole={role} workspaces={data.workspaces} />
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
    {role === 'tenant_admin' ? <TenantWorkspaceControl /> : <ModuleWorkspaceControl />}
  </div>
)}
    </RouteFrame>
  );
}

function UserCard({
  user,
  currentUserRole,
  workspaces,
}: {
  user: ManagedTenantAccount;
  currentUserRole: string;
  workspaces: ManagedWorkspaceOption[];
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
        queryKey: getGetTenantAdministrationQueryKey(),
      });
    } catch {}
  };

  const canEdit =
    currentUserRole === 'module_admin' &&
    (user.role === 'module_staff' || user.role === 'client');

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
        queryKey: getGetTenantAdministrationQueryKey(),
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
        queryKey: getGetTenantAdministrationQueryKey(),
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
    isTenantAdmin ? 'module_admin' : 'module_staff',
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
        queryKey: getGetTenantAdministrationQueryKey(),
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
            New {isTenantAdmin ? 'Module Administrator' : role.replace('_', ' ')}
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
              <option value="module_staff">Module Staff</option>
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
