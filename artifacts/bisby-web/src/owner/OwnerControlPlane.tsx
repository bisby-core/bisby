import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { WorkspaceControlUI, type UnifiedWorkspace } from '@/admin/WorkspaceControlUI';
import { StaffWorkspaceCard } from '@/admin/StaffWorkspaceAssignment';
import { ArrowUpRight } from 'lucide-react';
import {
  WorkspaceMetadataRequest,
  WorkspaceAccessLevel,
  WorkspaceContentNodeType,
  WorkspaceHierarchyNodeInput,
  WorkspaceHierarchyNodeUpdate,
} from '@workspace/api-client-react';
import {
  Activity,
  Building2,
  Check,
  CircleAlert,
  Database,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';


interface OwnerWorkspaceList {
  workspaces: UnifiedWorkspace[];
}
interface OwnerSession {
  readonly authenticated: true;
  readonly username: string;
}

interface PlatformStaffAccount {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly requiresPasswordChange: boolean;
  readonly workspaceKeys: readonly string[];
}

interface PlatformStaffSnapshot {
  readonly staff: readonly PlatformStaffAccount[];
  readonly workspaces: readonly {
    readonly workspaceKey: string;
    readonly displayName: string;
    readonly isActive: boolean;
  }[];
}

interface ControlPlaneTenant {
  readonly id: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly activeModuleCount: number;
  readonly createdAt: string;
  readonly modules: readonly ControlPlaneModule[];
}

interface ControlPlaneModule {
  readonly moduleKey: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
}

interface PlatformAuditEvent {
  readonly eventType: string;
  readonly actorUsername: string;
  readonly subdomain: string | null;
  readonly details: Record<string, unknown>;
  readonly createdAt: string;
}

interface ControlPlaneSnapshot {
  readonly tenants: readonly ControlPlaneTenant[];
  readonly availableModuleCount: number;
  readonly recentAudit: readonly PlatformAuditEvent[];
}

interface TenantAdmin {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly requiresPasswordChange: boolean;
}

interface TenantAdminsSnapshot {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly tenantAdmins: readonly TenantAdmin[];
}

interface TenantAdminResetForm {
  currentUsername: string;
  newUsername: string;
  temporaryPassword: string;
}

interface TenantAdminCreateForm {
  username: string;
  displayName: string;
  temporaryPassword: string;
}

interface ProvisioningForm {
  subdomain: string;
  displayName: string;
  databaseName: string;
  adminUsername: string;
  adminPassword: string;
}

interface ProvisioningResult {
  readonly status: 'provisioned';
  readonly tenantId: string;
  readonly subdomain: string;
  readonly displayName: string;
  readonly adminUsername: string;
  readonly enabledModuleCount: number;
}

class OwnerApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const emptyProvisioningForm: ProvisioningForm = {
  subdomain: '',
  displayName: '',
  databaseName: '',
  adminUsername: 'admin',
  adminPassword: '',
};

async function ownerApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/owner${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-BisBy-Owner-Request': '1',
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new OwnerApiError(
      body.message ?? 'The owner request could not be completed.',
      response.status,
    );
  }
  return body as T;
}

function OwnerFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bisby-noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.9)] px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <span className="font-mono text-sm font-medium">B/</span>
            </span>
            <div>
              <p className="font-mono text-sm font-medium tracking-[0.18em]">BISBY</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Platform control plane</p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            <LockKeyhole className="h-3.5 w-3.5" />
            Root host only
          </div>
        </div>
      </header>
      {import.meta.env.DEV && (
        <div
          className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.42)] px-5 py-3 md:px-10"
          aria-label="Development preview ports"
        >
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">
              Preview domain menu
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--foreground))] underline decoration-[hsl(var(--secondary))] underline-offset-4 transition-colors hover:text-[hsl(var(--secondary-foreground))]"
              data-testid="development-platform-port"
            >
              Platform · 25321
            </span>
            <a
              href="/?plane=design"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] underline decoration-[hsl(var(--secondary))] underline-offset-4 transition-colors hover:text-[hsl(var(--foreground))]"
              data-testid="development-design-port"
            >
              Design
            </a>
            <a
              href="/?plane=clientalpha"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] underline decoration-[hsl(var(--secondary))] underline-offset-4 transition-colors hover:text-[hsl(var(--foreground))]"
              data-testid="development-clientalpha-port"
            >
              Clientalpha
            </a>
          </div>
        </div>
      )}
      <main className="bisby-grid min-h-[calc(100dvh-73px)] px-5 py-8 md:px-10 md:py-12">
        <div className="mx-auto max-w-[1200px]">
          <div className="bisby-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            <span className="h-1.5 w-1.5 bg-[hsl(var(--accent))]" />
            {eyebrow}
          </div>
          <h1 className="bisby-reveal mt-5 max-w-4xl font-sans text-4xl font-semibold leading-[1.06] tracking-[-0.045em] [animation-delay:80ms] md:text-6xl">
            {title}
          </h1>
          {children}
        </div>
      </main>
    </div>
  );
}

function OwnerLogin({ onAuthenticated }: { onAuthenticated: (session: OwnerSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [publicWorkspaces, setPublicWorkspaces] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/owner/public/workspaces')
      .then(res => res.json())
      .then(data => setPublicWorkspaces(data.workspaces || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const session = await ownerApi<OwnerSession>('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setPassword('');
      onAuthenticated(session);
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError && requestError.status === 401
          ? 'The owner username or password was not accepted.'
          : 'Owner access is unavailable right now.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OwnerFrame eyebrow="BisBy / owner access" title="Enter the platform control plane.">
      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <form
          onSubmit={handleSubmit}
          className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"
          data-testid="form-owner-login"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[hsl(var(--secondary)/.22)] text-[hsl(var(--secondary-foreground))]">
              <LogIn className="h-4 w-4" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Platform owner</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Separate from every tenant-local account.</p>
            </div>
          </div>
          <label className="mt-10 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]" htmlFor="owner-username">
            Username
          </label>
          <input
            id="owner-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors focus:border-[hsl(var(--ring))]"
            data-testid="input-owner-username"
          />
          <label className="mt-6 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]" htmlFor="owner-password">
            Password
          </label>
          <input
            id="owner-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors focus:border-[hsl(var(--ring))]"
            data-testid="input-owner-password"
          />
          {error && (
            <p className="mt-5 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm leading-6 text-[hsl(var(--accent-foreground))]" data-testid="status-owner-login-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-8 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
            data-testid="button-owner-login"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {submitting ? 'Checking owner access' : 'Enter control plane'}
          </button>
        </form>
        <section className="border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] md:p-8">
          <ShieldCheck className="h-8 w-8 text-[hsl(var(--secondary))]" />
          <p className="mt-12 text-2xl font-semibold tracking-[-0.035em]">A separate platform boundary.</p>
          <p className="mt-4 text-sm leading-6 text-[hsl(var(--primary-foreground)/.64)]">
            Owner sessions are accepted only on the BisBy root host. Tenant subdomains cannot reach these controls.
          </p>
        </section>

      {publicWorkspaces.length > 0 && (
        <div className="mt-12 border-t border-[hsl(var(--border))] pt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))] mb-4">Platform Public Surfaces</p>
          <div className="flex flex-wrap gap-2">
            {publicWorkspaces.map(ws => (
              <a
                key={ws.workspaceKey}
                href={`/public/platform/${ws.workspaceKey}`}
                className="group flex items-center gap-2 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]"
              >
                {ws.displayName}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            ))}
          </div>
        </div>
      )}

</div>
    </OwnerFrame>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{detail}</p>
    </div>
  );
}

function moduleLabel(moduleKey: string): string {
  const suffix = moduleKey.replace(/^module_/, '').toUpperCase();
  return `Module ${suffix}`;
}

function ProvisionTenantForm({
  onProvisioned,
}: {
  onProvisioned: (result: ProvisioningResult) => void;
}) {
  const [form, setForm] = useState<ProvisioningForm>(emptyProvisioningForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof ProvisioningForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await ownerApi<ProvisioningResult>('/tenants/provision', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(emptyProvisioningForm);
      onProvisioned(result);
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The tenant could not be provisioned.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fields: Array<{
    key: keyof ProvisioningForm;
    label: string;
    placeholder: string;
    type?: string;
  }> = [
    { key: 'displayName', label: 'Tenant display name', placeholder: 'Northwind Health' },
    { key: 'subdomain', label: 'Tenant subdomain', placeholder: 'northwind-health' },
    { key: 'databaseName', label: 'Physical database name', placeholder: 'bisby_northwind_health' },
    { key: 'adminUsername', label: 'Initial Tenant Admin', placeholder: 'admin' },
    { key: 'adminPassword', label: 'Temporary Tenant Admin password', placeholder: 'At least 8 characters', type: 'password' },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"
      data-testid="form-provision-tenant"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">New tenant</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Provision a dedicated database.</h2>
        </div>
        <Plus className="h-5 w-5 text-[hsl(var(--secondary-foreground))]" />
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {fields.map((field, index) => (
          <label
            key={field.key}
            className={`block ${index === fields.length - 1 ? 'md:col-span-2' : ''}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">{field.label}</span>
            <input
              type={field.type ?? 'text'}
              value={form[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
              placeholder={field.placeholder}
              autoComplete={field.key === 'adminPassword' ? 'new-password' : 'off'}
              minLength={field.key === 'adminPassword' ? 8 : undefined}
              required
              className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.55)] focus:border-[hsl(var(--ring))]"
              data-testid={`input-provision-${field.key}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-6 border-l-2 border-[hsl(var(--secondary))] pl-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
        BisBy will create one physical PostgreSQL database, apply the tenant blueprint, enable all eight modules, and create the initial Tenant Admin.
      </div>
      {error && (
        <p className="mt-5 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm leading-6 text-[hsl(var(--accent-foreground))]" data-testid="status-provision-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="mt-8 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
        data-testid="button-provision-tenant"
      >
        {submitting ? <Activity className="h-3.5 w-3.5 animate-pulse" /> : <Database className="h-3.5 w-3.5" />}
        {submitting ? 'Provisioning physical database' : 'Provision tenant'}
      </button>
    </form>
  );
}


function PlatformWorkspaceControl({ setError, setNotice }: { setError: (msg: string) => void, setNotice: (msg: string) => void }) {
  const [workspaces, setWorkspaces] = useState<UnifiedWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const data = await ownerApi<OwnerWorkspaceList>('/workspaces');
      setWorkspaces(data.workspaces);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const handleCreate = async (data: WorkspaceMetadataRequest) => {
    setPendingAction('create');
    setError(''); setNotice('');
    try {
      await ownerApi('/workspaces', { method: 'POST', body: JSON.stringify(data) });
      setNotice(`Platform workspace "${data.displayName}" created.`);
      await loadWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Could not create workspace.');
      throw err;
    } finally {
      setPendingAction(null);
    }
  };

  const handleUpdateMetadata = async (workspaceKey: string, data: WorkspaceMetadataRequest) => {
    setPendingAction('update-meta');
    setError(''); setNotice('');
    try {
      await ownerApi(`/workspaces/${workspaceKey}`, { method: 'PATCH', body: JSON.stringify(data) });
      setNotice(`Platform workspace ${workspaceKey} metadata updated.`);
      await loadWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Could not update workspace metadata.');
      throw err;
    } finally {
      setPendingAction(null);
    }
  };

  const handleUpdateAccess = async (workspaceKey: string, controls: {nodeId: string, accessLevel: WorkspaceAccessLevel}[]) => {
    setPendingAction('update-access');
    setError(''); setNotice('');
    try {
      await ownerApi(`/workspaces/${workspaceKey}/access`, { method: 'PUT', body: JSON.stringify({ controls }) });
      setNotice(`Platform workspace ${workspaceKey} access updated.`);
      await loadWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Could not update workspace access.');
      throw err;
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async (workspaceKey: string) => {
    setPendingAction('remove');
    setError(''); setNotice('');
    try {
      await ownerApi(`/workspaces/${workspaceKey}`, { method: 'DELETE' });
      setNotice(`Platform workspace ${workspaceKey} permanently removed.`);
      await loadWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Could not remove workspace.');
      throw err;
    } finally {
      setPendingAction(null);
    }
  };

  const handleAddHierarchyNode = async (data: WorkspaceHierarchyNodeInput) => {
    setPendingAction('add-hierarchy');
    setError(''); setNotice('');
    try {
      await ownerApi('/workspaces/hierarchy', { method: 'POST', body: JSON.stringify(data) });
      setNotice(`Platform workspace hierarchy node "${data.displayName}" added.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add workspace hierarchy node.');
      throw err;
    } finally {
      await loadWorkspaces();
      setPendingAction(null);
    }
  };

  const handleUpdateHierarchyNode = async (
    nodeType: WorkspaceContentNodeType,
    nodeKey: string,
    data: WorkspaceHierarchyNodeUpdate,
  ) => {
    setPendingAction('update-hierarchy');
    setError(''); setNotice('');
    try {
      await ownerApi(`/workspaces/hierarchy/${nodeType}/${nodeKey}`, { method: 'PATCH', body: JSON.stringify(data) });
      setNotice(`Platform workspace hierarchy node "${data.displayName}" updated.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update workspace hierarchy node.');
      throw err;
    } finally {
      await loadWorkspaces();
      setPendingAction(null);
    }
  };

  const handleRemoveHierarchyNode = async (nodeType: WorkspaceContentNodeType, nodeKey: string) => {
    setPendingAction('remove-hierarchy');
    setError(''); setNotice('');
    try {
      await ownerApi(`/workspaces/hierarchy/${nodeType}/${nodeKey}`, { method: 'DELETE' });
      setNotice(`Platform workspace hierarchy node "${nodeKey}" removed.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove workspace hierarchy node.');
      throw err;
    } finally {
      await loadWorkspaces();
      setPendingAction(null);
    }
  };

  return (
    <div className="mt-12">
      <WorkspaceControlUI
        title="Platform Admin Staff Workspaces"
        description="Manage semantic workspace access for Platform Admin Staff."
        workspaces={workspaces}
        isLoading={isLoading}
        isError={isError}
        isMatrix={true}
        createPending={pendingAction === 'create'}
        createError={false}
        onCreate={handleCreate}
        updateMetadataPending={pendingAction === 'update-meta'}
        updateMetadataError={false}
        onUpdateMetadata={handleUpdateMetadata}
        updateAccessPending={pendingAction === 'update-access'}
        updateAccessError={false}
        onUpdateAccess={handleUpdateAccess}
        removePending={pendingAction === 'remove'}
        removeError={false}
        onRemove={handleRemove}
        addHierarchyNodePending={pendingAction === 'add-hierarchy'}
        updateHierarchyNodePending={pendingAction === 'update-hierarchy'}
        removeHierarchyNodePending={pendingAction === 'remove-hierarchy'}
        onAddHierarchyNode={handleAddHierarchyNode}
        onUpdateHierarchyNode={handleUpdateHierarchyNode}
        onRemoveHierarchyNode={handleRemoveHierarchyNode}
      />
    </div>
  );
}

function PlatformStaffControl({
  section,
  setError,
  setNotice,
}: {
  section: 'staff' | 'assignments';
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<PlatformStaffSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await ownerApi<PlatformStaffSnapshot>('/platform-staff'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load platform staff.');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  if (loading && !snapshot) {
    return <div className="flex items-center gap-3 py-8 text-sm text-[hsl(var(--muted-foreground))]"><Activity className="h-4 w-4 animate-pulse" /> Loading platform staff</div>;
  }

  if (section === 'assignments') {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-6">
          <div>
            <h3 className="font-mono text-sm uppercase tracking-[0.15em]">Platform Staff Workspace Assignment</h3>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Assign platform staff to one or more Platform Admin Staff Workspaces.</p>
          </div>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85">
            <Plus className="h-3.5 w-3.5" /> Add New
          </button>
        </div>

        {creating && (
          <div className="mt-8">
            <StaffWorkspaceCard
              mode="create"
              roleLabel="Platform Staff"
              workspaces={[...(snapshot?.workspaces ?? [])]}
              onClose={() => setCreating(false)}
              onCreate={async (data) => {
                setPendingAction('create');
                setError('');
                try {
                  await ownerApi('/platform-staff', {
                    method: 'POST',
                    body: JSON.stringify({
                      username: data.username,
                      displayName: data.displayName,
                      temporaryPassword: data.temporaryPassword,
                      workspaceKeys: data.workspaceKeys,
                    }),
                  });
                  setNotice(`${data.displayName} created as platform staff.`);
                  setCreating(false);
                  await loadSnapshot();
                } catch (requestError) {
                  setError(requestError instanceof Error ? requestError.message : 'Could not create platform staff.');
                  throw requestError;
                } finally {
                  setPendingAction(null);
                }
              }}
              pending={pendingAction === 'create'}
              error={false}
              testIdPrefix="platform-staff-workspace-assignment"
            />
          </div>
        )}

        <div className="mt-8 grid gap-4">
          {snapshot?.staff.map((staff) => (
            <StaffWorkspaceCard
              key={staff.id}
              mode="edit"
              defaultDisplayName={staff.displayName}
              defaultUsername={staff.username}
              roleLabel="Platform Staff"
              workspaces={[...(snapshot?.workspaces ?? [])]}
              defaultWorkspaceKeys={[...staff.workspaceKeys]}
              isActive={staff.isActive}
              pending={pendingAction === `action:${staff.id}`}
              error={false}
              onSave={async (keys) => {
                setPendingAction(`action:${staff.id}`);
                setError('');
                try {
                  await ownerApi(`/platform-staff/${staff.id}/workspaces`, {
                    method: 'PUT',
                    body: JSON.stringify({ workspaceKeys: keys }),
                  });
                  setNotice(`${staff.displayName}'s platform workspace assignment was updated.`);
                  await loadSnapshot();
                } catch (requestError) {
                  setError(requestError instanceof Error ? requestError.message : 'Could not update assignment.');
                } finally {
                  setPendingAction(null);
                }
              }}
              onSuspend={async () => {
                setPendingAction(`action:${staff.id}`);
                try {
                  await ownerApi(`/platform-staff/${staff.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
                  await loadSnapshot();
                } finally { setPendingAction(null); }
              }}
              onReactivate={async () => {
                setPendingAction(`action:${staff.id}`);
                try {
                  await ownerApi(`/platform-staff/${staff.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
                  await loadSnapshot();
                } finally { setPendingAction(null); }
              }}
              onDelete={async () => {
                setPendingAction(`action:${staff.id}`);
                try {
                  await ownerApi(`/platform-staff/${staff.id}`, { method: 'DELETE' });
                  await loadSnapshot();
                } finally { setPendingAction(null); }
              }}
              testIdPrefix="platform-staff-workspace-assignment"
            />
          ))}
          {snapshot?.staff.length === 0 && (
            <p className="border border-[hsl(var(--border))] p-8 text-center font-mono text-xs uppercase text-[hsl(var(--muted-foreground))]">No platform staff available for workspace assignment</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 border-b border-[hsl(var(--border))] pb-6 md:flex-row md:items-center">
        <div>
          <h3 className="font-mono text-sm uppercase tracking-[0.15em]">Platform Admin Staff</h3>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Manage platform staff accounts.</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4">
        {snapshot?.staff.map((staff) => (
          <div key={staff.id} className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><b>{staff.displayName}</b><p className="mt-2 font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{staff.username} · Platform Staff</p></div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase">{staff.isActive ? 'Active' : 'Inactive'}</span>
                <button type="button" disabled={!staff.isActive} onClick={() => setResettingId(resettingId === staff.id ? null : staff.id)} className="border p-2"><KeyRound className="h-4 w-4" /></button>
              </div>
            </div>
            {resettingId === staff.id && <form onSubmit={async (event) => {
              event.preventDefault();
              await ownerApi(`/platform-staff/${staff.id}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword: resetPassword }) });
              setResetPassword('');
              setResettingId(null);
              await loadSnapshot();
            }} className="mt-4 flex gap-2 border-t border-[hsl(var(--border))] pt-4"><input required minLength={8} type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Temporary password" className="border bg-transparent px-3 py-2" /><button className="bg-[hsl(var(--primary))] px-4 font-mono text-[10px] uppercase text-[hsl(var(--primary-foreground))]">Reset Password</button></form>}
          </div>
        ))}
      </div>
    </div>
  );
}

function OwnerDashboard({
  session,
  onSignedOut,
  rootDomain,
}: {
  session: OwnerSession;
  onSignedOut: () => void;
  rootDomain: string;
}) {
  const [snapshot, setSnapshot] = useState<ControlPlaneSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<ProvisioningResult | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [tenantAdminLoading, setTenantAdminLoading] = useState(true);
  const [tenantAdmins, setTenantAdmins] = useState<Record<string, readonly TenantAdmin[]>>({});
  const [tenantAdminForms, setTenantAdminForms] = useState<Record<string, TenantAdminResetForm>>({});
  const [tenantAdminCreateForms, setTenantAdminCreateForms] = useState<Record<string, TenantAdminCreateForm>>({});
  const [notice, setNotice] = useState('');
  const [platformStaffTab, setPlatformStaffTab] = useState<'staff' | 'assignments' | 'workspaces'>('staff');

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setTenantAdminLoading(true);
    setError('');
    try {
      const nextSnapshot = await ownerApi<ControlPlaneSnapshot>('/control-plane');
      const tenantAdminSnapshots = await Promise.all(
        nextSnapshot.tenants.map((tenant) =>
          ownerApi<TenantAdminsSnapshot>(`/tenants/${tenant.id}/tenant-admins`),
        ),
      );
      setSnapshot(nextSnapshot);
      setTenantAdmins(
        Object.fromEntries(
          tenantAdminSnapshots.map((tenant) => [tenant.tenantId, tenant.tenantAdmins]),
        ),
      );
      setTenantAdminForms((current) =>
        Object.fromEntries(
          tenantAdminSnapshots.map((tenant) => {
            const activeTenantAdmin = tenant.tenantAdmins.find((tenantAdmin) => tenantAdmin.isActive);
            const currentForm = current[tenant.tenantId];
            const currentTenantAdminIsAvailable = tenant.tenantAdmins.some(
              (tenantAdmin) => tenantAdmin.isActive && tenantAdmin.username === currentForm?.currentUsername,
            );
            return [
              tenant.tenantId,
              {
                currentUsername: currentTenantAdminIsAvailable
                  ? currentForm?.currentUsername ?? ''
                  : activeTenantAdmin?.username ?? '',
                newUsername: currentTenantAdminIsAvailable
                  ? currentForm?.newUsername ?? currentForm?.currentUsername ?? ''
                  : activeTenantAdmin?.username ?? '',
                temporaryPassword: '',
              },
            ];
          }),
        ),
      );
      setTenantAdminCreateForms((current) =>
        Object.fromEntries(
          tenantAdminSnapshots.map((tenant) => [
            tenant.tenantId,
            current[tenant.tenantId] ?? {
              username: '',
              displayName: '',
              temporaryPassword: '',
            },
          ]),
        ),
      );
    } catch (requestError) {
      if (requestError instanceof OwnerApiError && requestError.status === 401) {
        onSignedOut();
        return;
      }
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The control-plane snapshot is unavailable.',
      );
    } finally {
      setLoading(false);
      setTenantAdminLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const handleLogout = async () => {
    try {
      await ownerApi('/logout', { method: 'POST', body: '{}' });
    } finally {
      onSignedOut();
    }
  };

  const handleProvisioned = (result: ProvisioningResult) => {
    setSuccess(result);
    void loadSnapshot();
  };

  const handleTenantStatus = async (tenant: ControlPlaneTenant) => {
    const actionKey = `tenant:${tenant.id}`;
    setPendingAction(actionKey);
    setError('');
    try {
      await ownerApi(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !tenant.isActive }),
      });
      await loadSnapshot();
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The tenant status could not be updated.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleModuleStatus = async (
    tenant: ControlPlaneTenant,
    module: ControlPlaneModule,
  ) => {
    const actionKey = `module:${tenant.id}:${module.moduleKey}`;
    setPendingAction(actionKey);
    setError('');
    try {
      await ownerApi(`/tenants/${tenant.id}/modules/${module.moduleKey}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !module.isActive }),
      });
      await loadSnapshot();
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The module status could not be updated.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const updateTenantAdminForm = (
    tenantId: string,
    field: keyof TenantAdminResetForm,
    value: string,
  ) => {
    setTenantAdminForms((current) => ({
      ...current,
      [tenantId]: {
        currentUsername: current[tenantId]?.currentUsername ?? '',
        newUsername: current[tenantId]?.newUsername ?? '',
        temporaryPassword: current[tenantId]?.temporaryPassword ?? '',
        [field]: value,
      },
    }));
  };

  const selectTenantAdminForReset = (tenantId: string, username: string) => {
    setTenantAdminForms((current) => ({
      ...current,
      [tenantId]: {
        currentUsername: username,
        newUsername: username,
        temporaryPassword: current[tenantId]?.temporaryPassword ?? '',
      },
    }));
  };

  const updateTenantAdminCreateForm = (
    tenantId: string,
    field: keyof TenantAdminCreateForm,
    value: string,
  ) => {
    setTenantAdminCreateForms((current) => ({
      ...current,
      [tenantId]: {
        username: current[tenantId]?.username ?? '',
        displayName: current[tenantId]?.displayName ?? '',
        temporaryPassword: current[tenantId]?.temporaryPassword ?? '',
        [field]: value,
      },
    }));
  };

  const handleTenantAdminPasswordReset = async (tenant: ControlPlaneTenant) => {
    const form = tenantAdminForms[tenant.id];
    if (
      !form?.currentUsername ||
      !form.newUsername.trim() ||
      !form.temporaryPassword
    ) {
      return;
    }

    const actionKey = `tenantAdmin-reset:${tenant.id}`;
    setPendingAction(actionKey);
    setError('');
    setNotice('');
    try {
      await ownerApi(`/tenants/${tenant.id}/tenant-admins/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          currentUsername: form.currentUsername,
          newUsername: form.newUsername,
          temporaryPassword: form.temporaryPassword,
        }),
      });
      setNotice(`Tenant Admin credentials reset to ${form.newUsername} in ${tenant.displayName}.`);
      await loadSnapshot();
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The Tenant Admin password could not be reset.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleTenantAdminCreate = async (tenant: ControlPlaneTenant) => {
    const form = tenantAdminCreateForms[tenant.id];
    if (
      !form?.username.trim() ||
      !form.displayName.trim() ||
      form.temporaryPassword.length < 8
    ) {
      return;
    }

    const actionKey = `tenantAdmin-create:${tenant.id}`;
    setPendingAction(actionKey);
    setError('');
    setNotice('');
    try {
      await ownerApi(`/tenants/${tenant.id}/tenant-admins`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setTenantAdminCreateForms((current) => ({
        ...current,
        [tenant.id]: {
          username: '',
          displayName: '',
          temporaryPassword: '',
        },
      }));
      setNotice(`Tenant-local Tenant Admin ${form.username} created in ${tenant.displayName}.`);
      await loadSnapshot();
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The Tenant Admin could not be created.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleTenantAdminStatus = async (
    tenant: ControlPlaneTenant,
    tenantAdmin: TenantAdmin,
  ) => {
    const actionKey = `tenantAdmin-status:${tenantAdmin.id}`;
    setPendingAction(actionKey);
    setError('');
    setNotice('');
    try {
      await ownerApi(
        `/tenants/${tenant.id}/tenant-admins/${tenantAdmin.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ active: !tenantAdmin.isActive }),
        },
      );
      setNotice(
        `${tenantAdmin.username} ${tenantAdmin.isActive ? 'deactivated' : 'activated'} in ${tenant.displayName}.`,
      );
      await loadSnapshot();
    } catch (requestError) {
      setError(
        requestError instanceof OwnerApiError
          ? requestError.message
          : 'The Tenant Admin status could not be updated.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const activeTenants = snapshot?.tenants.filter((tenant) => tenant.isActive).length ?? 0;
  return (
    <OwnerFrame eyebrow="BisBy / owner control plane" title="Operate the tenant estate.">
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-[hsl(var(--border))] py-4">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--secondary))]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">
            Signed in as {session.username}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href="/platform/home"
            className="inline-flex items-center gap-2 border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85"
            data-testid="link-bisby-admin-home"
          >
            BisBy Admin Home
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            className="inline-flex items-center gap-2 border border-[hsl(var(--border))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 border border-[hsl(var(--border))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]"
            data-testid="button-owner-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Metric label="Registered tenants" value={String(snapshot?.tenants.length ?? '—')} detail="Master registry records" />
        <Metric label="Active tenants" value={String(snapshot ? activeTenants : '—')} detail="Available through tenant routing" />
        <Metric label="Module blueprint" value={String(snapshot?.availableModuleCount ?? '—')} detail="Canonical modules per tenant" />
      </div>

      {error && (
        <div className="mt-8 flex items-start gap-3 border border-[hsl(var(--accent)/.55)] bg-[hsl(var(--card)/.76)] p-5" data-testid="status-control-plane-error">
          <CircleAlert className="mt-0.5 h-5 w-5 text-[hsl(var(--accent-foreground))]" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em]">Control-plane data unavailable</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-8 flex items-start gap-3 border border-[hsl(var(--secondary)/.65)] bg-[hsl(var(--card)/.76)] p-5" data-testid="status-provision-success">
          <Check className="mt-0.5 h-5 w-5 text-[hsl(var(--secondary-foreground))]" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em]">Tenant provisioned</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {success.displayName} is active at {success.subdomain}.{rootDomain} with {success.enabledModuleCount} modules and tenant admin {success.adminUsername}.
            </p>
          </div>
        </div>
      )}

      {notice && (
        <p className="mt-6 border-l-2 border-[hsl(var(--secondary))] pl-3 text-sm text-[hsl(var(--muted-foreground))]" data-testid="status-tenantAdmin-success">
          {notice}
        </p>
      )}

      <section className="mt-12 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8">
        <div className="mb-8 flex flex-wrap gap-2 border-b border-[hsl(var(--border))] pb-4">
          {[
            ['staff', 'Platform Admin Staff'],
            ['assignments', 'Platform Staff Workspace Assignment'],
            ['workspaces', 'Platform Admin Staff Workspaces'],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPlatformStaffTab(id as typeof platformStaffTab)} className={`border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] ${platformStaffTab === id ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>
              {label}
            </button>
          ))}
        </div>
        {platformStaffTab === 'workspaces'
          ? <PlatformWorkspaceControl setError={setError} setNotice={setNotice} />
          : <PlatformStaffControl section={platformStaffTab} setError={setError} setNotice={setNotice} />}
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
        <ProvisionTenantForm onProvisioned={handleProvisioned} />
        <section className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Tenant registry</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Live tenant status.</h2>
            </div>
            <Building2 className="h-5 w-5 text-[hsl(var(--secondary-foreground))]" />
          </div>
          <div className="mt-8 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
            {loading && !snapshot ? (
              <div className="flex items-center gap-3 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                <Activity className="h-4 w-4 animate-pulse" /> Loading tenant registry
              </div>
            ) : snapshot?.tenants.length ? (
              snapshot.tenants.map((tenant) => (
                <div key={tenant.id} className="py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{tenant.displayName}</p>
                      <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{tenant.subdomain}.{rootDomain}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTenantStatus(tenant)}
                      disabled={pendingAction !== null}
                      className="shrink-0 border border-[hsl(var(--border))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] disabled:cursor-wait disabled:opacity-50"
                      data-testid={`button-tenant-status-${tenant.id}`}
                    >
                      {pendingAction === `tenant:${tenant.id}` ? 'Saving' : tenant.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`font-mono text-[10px] uppercase tracking-[0.13em] ${tenant.isActive ? 'text-[hsl(var(--secondary-foreground))]' : 'text-[hsl(var(--accent-foreground))]'}`}>
                      {tenant.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-[hsl(var(--border))]">·</span>
                    <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{tenant.activeModuleCount} modules enabled</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {tenant.modules.map((module) => {
                      const actionKey = `module:${tenant.id}:${module.moduleKey}`;
                      return (
                        <button
                          key={module.moduleKey}
                          type="button"
                          onClick={() => void handleModuleStatus(tenant, module)}
                          disabled={!module.isAvailable || pendingAction !== null}
                          className={`flex items-center justify-between gap-2 border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                            module.isActive
                              ? 'border-[hsl(var(--secondary)/.55)] bg-[hsl(var(--secondary)/.08)]'
                              : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]'
                          }`}
                          title={!module.isAvailable ? 'Module unavailable globally' : undefined}
                          data-testid={`button-module-status-${tenant.id}-${module.moduleKey}`}
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">{moduleLabel(module.moduleKey)}</span>
                          <span className="font-mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]">
                            {pendingAction === actionKey ? '…' : !module.isAvailable ? 'N/A' : module.isActive ? 'On' : 'Off'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                   <div className="mt-6 border-t border-[hsl(var(--border))] pt-5">
                     <div className="flex items-start justify-between gap-4">
                       <div>
                         <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">Tenant-local staff</p>
                         <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Owner-managed Tenant Admin accounts in this physical database.</p>
                       </div>
                       <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
                         {tenantAdminLoading && !tenantAdmins[tenant.id]
                           ? 'Loading'
                           : `${tenantAdmins[tenant.id]?.length ?? 0} accounts`}
                       </span>
                     </div>
                     {tenantAdminLoading && !tenantAdmins[tenant.id] ? (
                       <div className="mt-4 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                         <Activity className="h-3.5 w-3.5 animate-pulse" /> Loading staff accounts
                       </div>
                     ) : (
                       <>
                         <div className="mt-4 space-y-2">
                           {(tenantAdmins[tenant.id] ?? []).map((tenantAdmin) => (
                             <div key={tenantAdmin.id} className="flex items-center justify-between gap-3 border border-[hsl(var(--border))] px-3 py-2">
                               <div className="min-w-0">
                                 <p className="truncate text-sm">{tenantAdmin.displayName}</p>
                                 <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{tenantAdmin.username}</p>
                               </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                  {tenantAdmin.requiresPasswordChange && (
                                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--accent-foreground))]">
                                      Password change required
                                    </span>
                                  )}
                                  <span className={`font-mono text-[9px] uppercase tracking-[0.12em] ${tenantAdmin.isActive ? 'text-[hsl(var(--secondary-foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                                    {tenantAdmin.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void handleTenantAdminStatus(tenant, tenantAdmin)}
                                    disabled={pendingAction !== null}
                                    className="border border-[hsl(var(--border))] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors hover:border-[hsl(var(--primary))] disabled:cursor-wait disabled:opacity-50"
                                    data-testid={`button-tenantAdmin-status-${tenantAdmin.id}`}
                                  >
                                    {pendingAction === `tenantAdmin-status:${tenantAdmin.id}`
                                      ? 'Saving'
                                      : tenantAdmin.isActive
                                        ? 'Deactivate'
                                        : 'Activate'}
                                  </button>
                                </div>
                             </div>
                           ))}
                           {tenantAdmins[tenant.id]?.length === 0 && (
                             <p className="text-sm text-[hsl(var(--muted-foreground))]">No tenant-local staff accounts found.</p>
                           )}
                         </div>
                          <form
                            className="mt-4 grid gap-3 border-t border-[hsl(var(--border))] pt-4 sm:grid-cols-2 xl:grid-cols-[.8fr_1fr_1fr_auto] xl:items-end"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleTenantAdminCreate(tenant);
                            }}
                            data-testid={`form-create-tenantAdmin-${tenant.id}`}
                          >
                            <label className="block">
                              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Username</span>
                              <input
                                value={tenantAdminCreateForms[tenant.id]?.username ?? ''}
                                onChange={(event) => updateTenantAdminCreateForm(tenant.id, 'username', event.target.value)}
                                autoComplete="off"
                                maxLength={255}
                                required
                                disabled={pendingAction !== null}
                                className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 font-mono text-xs outline-none focus:border-[hsl(var(--ring))] disabled:opacity-50"
                                data-testid={`input-create-tenantAdmin-username-${tenant.id}`}
                              />
                            </label>
                            <label className="block">
                              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Display name</span>
                              <input
                                value={tenantAdminCreateForms[tenant.id]?.displayName ?? ''}
                                onChange={(event) => updateTenantAdminCreateForm(tenant.id, 'displayName', event.target.value)}
                                autoComplete="off"
                                maxLength={255}
                                required
                                disabled={pendingAction !== null}
                                className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 font-mono text-xs outline-none focus:border-[hsl(var(--ring))] disabled:opacity-50"
                                data-testid={`input-create-tenantAdmin-display-name-${tenant.id}`}
                              />
                            </label>
                            <label className="block">
                              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Temporary password</span>
                              <input
                                type="password"
                                minLength={8}
                                maxLength={255}
                                required
                                value={tenantAdminCreateForms[tenant.id]?.temporaryPassword ?? ''}
                                onChange={(event) => updateTenantAdminCreateForm(tenant.id, 'temporaryPassword', event.target.value)}
                                autoComplete="new-password"
                                placeholder="At least 8 characters"
                                disabled={pendingAction !== null}
                                className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 font-mono text-xs outline-none placeholder:text-[hsl(var(--muted-foreground)/.55)] focus:border-[hsl(var(--ring))] disabled:opacity-50"
                                data-testid={`input-create-tenantAdmin-password-${tenant.id}`}
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={pendingAction !== null}
                              className="inline-flex h-[38px] items-center justify-center gap-2 bg-[hsl(var(--primary))] px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid={`button-create-tenantAdmin-${tenant.id}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {pendingAction === `tenantAdmin-create:${tenant.id}` ? 'Creating' : 'Create account'}
                            </button>
                          </form>
                         <form
                             className="mt-4 grid gap-3 border-t border-[hsl(var(--border))] pt-4 sm:grid-cols-2 xl:grid-cols-[.8fr_1fr_1fr_auto] xl:items-end"
                           onSubmit={(event) => {
                             event.preventDefault();
                             void handleTenantAdminPasswordReset(tenant);
                           }}
                           data-testid={`form-reset-tenantAdmin-${tenant.id}`}
                         >
                           <label className="block">
                           <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Tenant Admin</span>
                             <select
                               value={tenantAdminForms[tenant.id]?.currentUsername ?? ''}
                               onChange={(event) => selectTenantAdminForReset(tenant.id, event.target.value)}
                               disabled={pendingAction !== null || !(tenantAdmins[tenant.id] ?? []).some((tenantAdmin) => tenantAdmin.isActive)}
                               className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 font-mono text-xs outline-none focus:border-[hsl(var(--ring))] disabled:opacity-50"
                               data-testid={`select-reset-tenantAdmin-${tenant.id}`}
                             >
                               {(tenantAdmins[tenant.id] ?? []).filter((tenantAdmin) => tenantAdmin.isActive).map((tenantAdmin) => (
                                 <option key={tenantAdmin.id} value={tenantAdmin.username}>{tenantAdmin.username}</option>
                               ))}
                             </select>
                           </label>
                            <label className="block">
                              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">New username</span>
                              <input
                                value={tenantAdminForms[tenant.id]?.newUsername ?? ''}
                                onChange={(event) => updateTenantAdminForm(tenant.id, 'newUsername', event.target.value)}
                                autoComplete="off"
                                maxLength={255}
                                required
                                disabled={pendingAction !== null || !(tenantAdmins[tenant.id] ?? []).some((tenantAdmin) => tenantAdmin.isActive)}
                                className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 font-mono text-xs outline-none focus:border-[hsl(var(--ring))] disabled:opacity-50"
                                data-testid={`input-reset-tenantAdmin-username-${tenant.id}`}
                              />
                            </label>
                           <label className="block">
                             <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Temporary password</span>
                             <input
                               type="password"
                               minLength={8}
                               maxLength={255}
                               required
                               value={tenantAdminForms[tenant.id]?.temporaryPassword ?? ''}
                               onChange={(event) => updateTenantAdminForm(tenant.id, 'temporaryPassword', event.target.value)}
                               autoComplete="new-password"
                               placeholder="At least 8 characters"
                               disabled={pendingAction !== null || !(tenantAdmins[tenant.id] ?? []).some((tenantAdmin) => tenantAdmin.isActive)}
                               className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 font-mono text-xs outline-none placeholder:text-[hsl(var(--muted-foreground)/.55)] focus:border-[hsl(var(--ring))] disabled:opacity-50"
                               data-testid={`input-reset-tenantAdmin-password-${tenant.id}`}
                             />
                           </label>
                           <button
                             type="submit"
                             disabled={pendingAction !== null || !(tenantAdmins[tenant.id] ?? []).some((tenantAdmin) => tenantAdmin.isActive)}
                             className="inline-flex h-[38px] items-center justify-center gap-2 bg-[hsl(var(--primary))] px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                             data-testid={`button-reset-tenantAdmin-${tenant.id}`}
                           >
                             <KeyRound className="h-3.5 w-3.5" />
                              {pendingAction === `tenantAdmin-reset:${tenant.id}` ? 'Resetting' : 'Reset credentials'}
                           </button>
                         </form>
                         {!(tenantAdmins[tenant.id] ?? []).some((tenantAdmin) => tenantAdmin.isActive) && (
                           <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Only active staff accounts can receive a temporary password.</p>
                         )}
                       </>
                     )}
                   </div>
                </div>
              ))
            ) : (
              <p className="py-5 text-sm text-[hsl(var(--muted-foreground))]">No tenants are registered.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Recent audit activity</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Append-only owner events.</h2>
          </div>
          <ShieldCheck className="h-5 w-5 text-[hsl(var(--secondary-foreground))]" />
        </div>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                <th className="pb-3 font-normal">Event</th>
                <th className="pb-3 font-normal">Owner</th>
                <th className="pb-3 font-normal">Tenant</th>
                <th className="pb-3 text-right font-normal">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.recentAudit.map((event, index) => (
                <tr key={`${event.eventType}-${event.createdAt}-${index}`} className="border-b border-[hsl(var(--border))] text-sm">
                  <td className="py-3 font-mono text-xs">{event.eventType}</td>
                  <td className="py-3 text-[hsl(var(--muted-foreground))]">{event.actorUsername}</td>
                  <td className="py-3 text-[hsl(var(--muted-foreground))]">{event.subdomain ?? '—'}</td>
                  <td className="py-3 text-right font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </OwnerFrame>
  );
}

export function OwnerControlPlane({ rootDomain }: { rootDomain: string }) {
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    ownerApi<OwnerSession>('/me')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <OwnerFrame eyebrow="BisBy / owner control plane" title="Checking the platform boundary.">
        <div className="mt-12 flex items-center gap-3 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 text-sm text-[hsl(var(--muted-foreground))]">
          <Activity className="h-4 w-4 animate-pulse" />
          Resolving the owner session
        </div>
      </OwnerFrame>
    );
  }

  if (!session) {
    return <OwnerLogin onAuthenticated={setSession} />;
  }

  return <OwnerDashboard session={session} onSignedOut={() => setSession(null)} rootDomain={rootDomain} />;
}

export function OwnerHome() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    ownerApi<OwnerSession>('/me')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!checkingSession && !session) setLocation('/');
  }, [checkingSession, session, setLocation]);

  if (checkingSession || !session) {
    return (
      <OwnerFrame eyebrow="BisBy / admin home" title="Checking the platform boundary.">
        <div className="mt-12 flex items-center gap-3 border border-[hsl(var(--border))] p-6">
          <Activity className="h-4 w-4 animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-[0.15em]">Verifying Access</span>
        </div>
      </OwnerFrame>
    );
  }

  return (
    <div className="bisby-noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-5 py-6 md:min-h-[100dvh] md:border-b-0 md:border-r">
        <p className="font-mono text-sm font-medium tracking-[0.18em] text-[hsl(var(--sidebar-foreground))]">BISBY</p>
        <h1 className="mt-10 text-2xl font-semibold tracking-[-0.035em] text-[hsl(var(--sidebar-foreground))]">BisBy Admin Home</h1>
        <nav className="mt-8" aria-label="BisBy Admin Home">
          <Link
            href="/platform/home/dashboard"
            className="flex border-l-2 border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-accent))] px-3 py-3 font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--sidebar-foreground))]"
            data-testid="link-bisby-admin-dashboard"
          >
            Dashboard
          </Link>
        </nav>
        <Link href="/" className="mt-10 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--sidebar-foreground)/.64)]">
          <ArrowUpRight className="h-3.5 w-3.5 rotate-180" />
          Platform Administrator
        </Link>
      </aside>
      <main className="bisby-grid min-h-[100dvh] px-5 py-10 md:px-12 md:py-14">
        <h2 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl" data-testid="title-bisby-admin-dashboard">
          BisBy Admin Dashboard
        </h2>
      </main>
    </div>
  );
}