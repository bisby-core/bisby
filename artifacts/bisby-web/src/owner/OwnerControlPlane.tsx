import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
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

interface OwnerSession {
  readonly authenticated: true;
  readonly username: string;
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

interface ProvisioningForm {
  subdomain: string;
  displayName: string;
  databaseName: string;
  adminUsername: string;
  adminPassword: string;
}

interface TenantAdministrator { readonly id: string; readonly username: string; readonly displayName: string; readonly active: boolean; }

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
    { key: 'adminUsername', label: 'Initial administrator', placeholder: 'admin' },
    { key: 'adminPassword', label: 'Temporary administrator password', placeholder: 'At least 12 characters', type: 'password' },
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
              minLength={field.key === 'adminPassword' ? 12 : undefined}
              required
              className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.55)] focus:border-[hsl(var(--ring))]"
              data-testid={`input-provision-${field.key}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-6 border-l-2 border-[hsl(var(--secondary))] pl-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
        BisBy will create one physical PostgreSQL database, apply the tenant blueprint, enable all eight modules, and create the initial administrator.
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

function AdministratorReset({ tenant }: { tenant: ControlPlaneTenant }) {
  const [administrators, setAdministrators] = useState<readonly TenantAdministrator[]>([]);
  const [username, setUsername] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { void ownerApi<{ administrators: readonly TenantAdministrator[] }>(`/tenants/${tenant.id}/administrators`).then((value) => { setAdministrators(value.administrators); setUsername(value.administrators[0]?.username ?? ''); }).catch(() => setMessage('Administrators could not be loaded.')); }, [tenant.id]);
  const reset = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setLoading(true); setMessage(''); try { await ownerApi(`/tenants/${tenant.id}/administrators/reset-password`, { method: 'POST', body: JSON.stringify({ username, temporaryPassword }) }); setTemporaryPassword(''); setMessage(`Temporary password set for ${username}. Share it through an approved channel.`); } catch (error) { setMessage(error instanceof OwnerApiError ? error.message : 'Password reset could not be completed.'); } finally { setLoading(false); } };
  return <form onSubmit={reset} className="border-t border-[hsl(var(--border))] pt-4"><p className="text-sm font-medium">{tenant.displayName}</p><label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Administrator<select value={username} onChange={(event) => setUsername(event.target.value)} required className="mt-2 block w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm">{administrators.map((administrator) => <option key={administrator.id} value={administrator.username}>{administrator.displayName} ({administrator.username})</option>)}</select></label><label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Temporary password<input value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} type="password" minLength={12} autoComplete="new-password" required className="mt-2 block w-full border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm" /></label><button disabled={loading || !username} className="mt-3 border border-[hsl(var(--border))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] disabled:opacity-50">{loading ? 'Resetting' : 'Reset password'}</button>{message && <p className="mt-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{message}</p>}</form>;
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

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSnapshot(await ownerApi<ControlPlaneSnapshot>('/control-plane'));
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
              {success.displayName} is active at {success.subdomain}.{rootDomain} with {success.enabledModuleCount} modules and administrator {success.adminUsername}.
            </p>
          </div>
        </div>
      )}

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
                </div>
              ))
            ) : (
              <p className="py-5 text-sm text-[hsl(var(--muted-foreground))]">No tenants are registered.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Tenant administrators</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Owner-controlled password resets.</h2><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Set a temporary tenant-local administrator password, then share it only through an approved channel.</p><div className="mt-6 space-y-5">{snapshot?.tenants.map((tenant) => <AdministratorReset key={tenant.id} tenant={tenant} />)}</div></section>

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