import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Grid2X2,
  LockKeyhole,
  LogIn,
  Radio,
  RotateCcw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import {
  getGetRouteAccessQueryKey,
  ModuleKey,
  useLogin,
  useLogout,
  useGetRouteAccess,
  useHealthCheck,
  WorkspaceKey,
} from '@workspace/api-client-react';
import {
  Route,
  Switch,
  Link,
  useParams,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const moduleLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
type ModuleLetter = (typeof moduleLetters)[number];

const moduleKeys: Record<ModuleLetter, ModuleKey> = {
  a: ModuleKey.module_a,
  b: ModuleKey.module_b,
  c: ModuleKey.module_c,
  d: ModuleKey.module_d,
  e: ModuleKey.module_e,
  f: ModuleKey.module_f,
  g: ModuleKey.module_g,
  h: ModuleKey.module_h,
};

const isModuleLetter = (value: string): value is ModuleLetter =>
  moduleLetters.includes(value.toLowerCase() as ModuleLetter);

const workspaceKeyFor = (number: string): WorkspaceKey | null => {
  const numeric = Number(number);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 10
    ? `ws-${numeric}`
    : null;
};

const tenantNameFromHostname = (hostname: string): string | null => {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  const suffix = '.bisby.pro';
  if (!normalizedHostname.endsWith(suffix)) return null;

  const subdomain = normalizedHostname.slice(0, -suffix.length);
  if (subdomain === 'www') return null;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) return null;

  return subdomain
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  return candidate.status ?? candidate.statusCode ?? candidate.response?.status;
};

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-home">
      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
        <span className="font-mono text-sm font-medium">B/</span>
      </span>
      <span className="font-mono text-sm font-medium tracking-[0.18em] text-[hsl(var(--sidebar-foreground))]">
        BISBY
      </span>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const activeLetter = location.split('/')[1];
  return (
    <div className="bisby-noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[232px] flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-5 py-6 md:flex">
        <BrandMark />
        <div className="mt-14">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--sidebar-foreground)/.48)]">
            Modules
          </p>
          <nav className="space-y-1" aria-label="Module navigation">
            {moduleLetters.map((letter) => (
              <Link
                key={letter}
                href={`/${letter}`}
                className={`group flex items-center justify-between border-l-2 px-3 py-2.5 font-mono text-xs uppercase tracking-[0.14em] transition-colors ${
                  activeLetter === letter
                    ? 'border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]'
                    : 'border-transparent text-[hsl(var(--sidebar-foreground)/.6)] hover:border-[hsl(var(--sidebar-primary)/.5)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]'
                }`}
                data-testid={`link-module-${letter}`}
              >
                <span>Module {letter}</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-[hsl(var(--sidebar-border))] pt-4">
          <div className="flex items-center gap-2.5 text-[hsl(var(--sidebar-foreground)/.56)]">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--sidebar-primary))]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">Tenant isolated</span>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-5 text-[hsl(var(--sidebar-foreground)/.38)]">
            Access is resolved from
            <br />
            the destination URL.
          </p>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.9)] px-5 py-4 backdrop-blur md:ml-[232px] md:px-10">
        <div className="md:hidden">
          <BrandMark />
        </div>
        <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))] md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--secondary))]" />
          Private workspace layer
        </div>
        <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
          <LockKeyhole className="h-3.5 w-3.5" />
          Tenant scoped
        </div>
      </header>
      <main className="md:ml-[232px]">{children}</main>
    </div>
  );
}

function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const tones = {
    neutral: 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]',
    good: 'border-[hsl(var(--secondary)/.55)] text-[hsl(161_33%_35%)]',
    warn: 'border-[hsl(var(--accent)/.6)] text-[hsl(13_55%_42%)]',
  };
  return (
    <span className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === 'good' ? 'bg-[hsl(var(--secondary))]' : tone === 'warn' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted-foreground)/.55)]'}`} />
      {children}
    </span>
  );
}

function RouteFrame({ eyebrow, title, children, footer }: { eyebrow: string; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bisby-grid min-h-[calc(100dvh-73px)] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-[1120px]">
        <div className="bisby-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          <span className="h-1.5 w-1.5 bg-[hsl(var(--accent))]" />
          {eyebrow}
        </div>
        <h1 className="bisby-reveal mt-5 max-w-3xl font-sans text-4xl font-semibold leading-[1.06] tracking-[-0.045em] text-[hsl(var(--foreground))] [animation-delay:80ms] md:text-6xl">
          {title}
        </h1>
        {children}
        {footer}
      </div>
    </div>
  );
}

function PlatformHome() {
  return (
    <RouteFrame eyebrow="BisBy / platform" title="Tenant-isolated operations, built to scale.">
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/owner/login" className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))]" data-testid="link-owner-login"><LockKeyhole className="h-3.5 w-3.5" /> Owner sign in</Link>
        <a href="#modules" className="inline-flex items-center gap-2 border border-[hsl(var(--border))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Explore modules <ArrowUpRight className="h-3.5 w-3.5" /></a>
      </div>
      <div className="mt-12 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">The BisBy model</p><p className="mt-6 max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.035em]">Every tenant operates from a dedicated subdomain and physically separate database.</p><p className="mt-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Platform controls stay with BisBy. Tenant users only access the applications, workspaces, and modules assigned to their organization.</p></section>
        <section className="bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] md:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground)/.58)]">Tenant entry</p><p className="mt-10 text-2xl font-semibold tracking-[-0.035em]">Your work stays local to your tenant.</p><p className="mt-4 text-sm leading-6 text-[hsl(var(--primary-foreground)/.64)]">Use your organization’s BisBy subdomain to sign in and open assigned workspaces.</p></section>
      </div>
      <section id="modules" className="mt-12 border-t border-[hsl(var(--border))] pt-6"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Platform modules</p><div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">{moduleLetters.map((letter) => <div key={letter} className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] p-4"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">Module {letter}</p><p className="mt-5 text-sm font-medium">Explicit access boundaries</p></div>)}</div></section>
    </RouteFrame>
  );
}

function RootHome() {
  return tenantNameFromHostname(window.location.hostname) ? <Home /> : <PlatformHome />;
}

function OwnerLogin() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setError(false);
    try { const response = await fetch('/api/owner/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }); if (!response.ok) throw new Error('invalid'); setLocation('/owner/dashboard'); } catch { setError(true); } finally { setPending(false); }
  };
  return <RouteFrame eyebrow="BisBy / owner access" title="Owner Control Center"><form onSubmit={submit} className="mt-12 max-w-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Platform owner only</p><label className="mt-8 block font-mono text-[10px] uppercase tracking-[0.15em]" htmlFor="owner-username">Username</label><input id="owner-username" required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3" /><label className="mt-5 block font-mono text-[10px] uppercase tracking-[0.15em]" htmlFor="owner-password">Password</label><input id="owner-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3" />{error && <p className="mt-5 text-sm text-[hsl(var(--destructive))]">The username or password was not accepted.</p>}<button disabled={pending} className="mt-8 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))]"><LogIn className="h-3.5 w-3.5" />{pending ? 'Signing in' : 'Sign in'}</button></form></RouteFrame>;
}

interface ControlPlaneData {
  tenants: Array<{ id: string; subdomain: string; displayName: string; active: boolean; enabledModuleCount: number; createdAt: string }>;
  audit: Array<{ id: number; actorUsername: string; action: string; tenantId: string | null; createdAt: string }>;
}

function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<'loading' | 'ready' | 'blocked' | 'error'>('loading');
  const [username, setUsername] = useState('');
  const [controlPlane, setControlPlane] = useState<ControlPlaneData | null>(null);
  useEffect(() => {
    void fetch('/api/owner/me').then(async (response) => {
      if (!response.ok) { setState('blocked'); return; }
      setUsername((await response.json()).username);
      const controlResponse = await fetch('/api/owner/control-plane');
      if (!controlResponse.ok) throw new Error('control-plane-unavailable');
      setControlPlane(await controlResponse.json() as ControlPlaneData);
      setState('ready');
    }).catch(() => setState('error'));
  }, []);
  useEffect(() => { if (state === 'blocked') setLocation('/owner/login'); }, [state, setLocation]);
  if (state === 'loading' || state === 'blocked') return <RouteFrame eyebrow="BisBy / owner" title="Loading control center."><div /></RouteFrame>;
  if (state === 'error') return <RouteFrame eyebrow="BisBy / owner" title="Control plane unavailable."><p className="mt-8 text-sm text-[hsl(var(--muted-foreground))]">Apply the phase-1 master database migration, then reload this page.</p></RouteFrame>;
  return <RouteFrame eyebrow="BisBy / owner" title="Platform control center">
    <div className="mt-10 flex items-center justify-between"><p className="text-sm text-[hsl(var(--muted-foreground))]">Signed in as {username}</p><button onClick={() => { void fetch('/api/owner/logout', { method: 'POST' }).finally(() => setLocation('/')); }} className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Sign out</button></div>
    <section className="mt-8 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Tenant registry</p><h2 className="mt-3 text-xl font-semibold">Registered tenants</h2></div><span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{controlPlane?.tenants.length ?? 0} total</span></div><div className="mt-6 divide-y divide-[hsl(var(--border))]">{controlPlane?.tenants.map((tenant) => <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{tenant.displayName}</p><p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{tenant.subdomain}.bisby.pro · {tenant.enabledModuleCount} active modules</p></div><StatusPill tone={tenant.active ? 'good' : 'warn'}>{tenant.active ? 'active' : 'inactive'}</StatusPill></div>)}{controlPlane?.tenants.length === 0 && <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">No tenants are registered yet.</p>}</div></section>
    <section className="mt-5 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Audit information</p><h2 className="mt-3 text-xl font-semibold">Recent owner activity</h2><div className="mt-5 divide-y divide-[hsl(var(--border))]">{controlPlane?.audit.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{entry.action}</span><span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{new Date(entry.createdAt).toLocaleString()}</span></div>)}{controlPlane?.audit.length === 0 && <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">No recorded control-plane actions yet.</p>}</div></section>
    <p className="mt-6 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Phase 1 provides live registry visibility and immutable access auditing. Tenant provisioning, activation controls, modules, and administrator assignment follow in the next phases.</p>
  </RouteFrame>;
}

function Home() {
  const health = useHealthCheck();
  const healthStatus = health.isLoading ? 'checking' : health.isError ? 'unavailable' : 'reachable';
  const tenantName = tenantNameFromHostname(window.location.hostname);
  return (
    <RouteFrame eyebrow="BisBy / entry point" title={tenantName ? `${tenantName} Entry Portal` : 'A precise way in.'}>
      <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="bisby-reveal border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 [animation-delay:160ms] md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Tenant URL format</p>
              <p className="mt-5 break-all font-mono text-lg leading-relaxed text-[hsl(var(--foreground))] md:text-2xl">
                <span className="text-[hsl(var(--accent))]">{'{tenant}'}</span>
                <span className="text-[hsl(var(--muted-foreground))]">.bisby.pro/</span>
                <span className="text-[hsl(var(--secondary-foreground))]">a</span>
                <span className="text-[hsl(var(--muted-foreground))]">/ws-</span>
                <span className="text-[hsl(var(--secondary-foreground))]">1</span>
              </p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div className="mt-8 grid gap-3 border-t border-[hsl(var(--border))] pt-5 text-sm leading-6 text-[hsl(var(--muted-foreground))] md:grid-cols-2">
            <p>Each tenant arrives through its own subdomain. The path selects the module and, when present, the workspace.</p>
            <p>Use a direct destination when you already know where work belongs. No ambiguous home screen is required.</p>
          </div>
        </section>

        <section className="bisby-reveal relative overflow-hidden border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] [animation-delay:240ms] md:p-8">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-[hsl(var(--secondary)/.28)]" />
          <div className="absolute -right-2 top-1 h-20 w-20 rounded-full border border-[hsl(var(--secondary)/.2)]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground)/.58)]">Entry state</p>
              <StatusPill tone={healthStatus === 'reachable' ? 'good' : healthStatus === 'unavailable' ? 'warn' : 'neutral'}>
                {healthStatus}
              </StatusPill>
            </div>
            <div className="mt-14 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center border border-[hsl(var(--secondary)/.45)] text-[hsl(var(--secondary))]">
                {healthStatus === 'reachable' ? <Check className="h-5 w-5" /> : <Radio className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.15em]">
                  {tenantName ? 'Authorized access point' : 'Destination pending'}
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--primary-foreground)/.62)]">
                  {tenantName ? `Welcome back, ${tenantName} Team.` : 'Awaiting a tenant path.'}
                </p>
              </div>
            </div>
            <div className="mt-10 space-y-2">
              <div className="bisby-skeleton h-2 w-full opacity-20" />
              <div className="bisby-skeleton h-2 w-[72%] opacity-20" />
              <div className="bisby-skeleton h-2 w-[48%] opacity-20" />
            </div>
          </div>
        </section>
      </div>

      <div className="bisby-reveal mt-12 border-t border-[hsl(var(--border))] pt-6 [animation-delay:320ms]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Built route families</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Choose a module to inspect its explicit destination state.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {moduleLetters.map((letter) => (
              <Link key={letter} href={`/${letter}`} className="group flex items-center gap-2 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]" data-testid={`link-entry-module-${letter}`}>
                {letter}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </RouteFrame>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="mt-12 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.74)] p-6 md:p-8" data-testid="status-route-loading">
      <div className="flex items-center gap-3">
        <Activity className="h-4 w-4 animate-pulse text-[hsl(var(--secondary-foreground))]" />
        <span className="font-mono text-xs uppercase tracking-[0.15em]">Resolving {label}</span>
      </div>
      <div className="mt-8 space-y-3">
        <div className="bisby-skeleton h-3 w-4/5" />
        <div className="bisby-skeleton h-3 w-3/5" />
        <div className="bisby-skeleton mt-8 h-24 w-full" />
      </div>
    </div>
  );
}

function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await login.mutateAsync({ data: { username, password } });
      await queryClient.invalidateQueries();
      setLocation('/a/ws-1');
    } catch {
      // The mutation state renders the safe API error below.
    }
  };

  const errorStatus = getErrorStatus(login.error);
  return (
    <RouteFrame eyebrow="BisBy / local access" title="Sign in to your tenant.">
      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <form
          onSubmit={handleSubmit}
          className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"
          data-testid="form-local-login"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[hsl(var(--secondary)/.22)] text-[hsl(var(--secondary-foreground))]">
              <LogIn className="h-4 w-4" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Tenant-local account</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Credentials stay inside the resolved tenant database.</p>
            </div>
          </div>
          <label className="mt-10 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors focus:border-[hsl(var(--ring))]"
            data-testid="input-login-username"
          />
          <label className="mt-6 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors focus:border-[hsl(var(--ring))]"
            data-testid="input-login-password"
          />
          {login.isError && (
            <p className="mt-5 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm leading-6 text-[hsl(var(--accent-foreground))]" data-testid="status-login-error">
              {errorStatus === 401 ? 'The username or password was not accepted.' : 'This tenant could not complete the sign-in request.'}
            </p>
          )}
          <button
            type="submit"
            disabled={login.isPending}
            className="mt-8 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
            data-testid="button-login-submit"
          >
            <LogIn className="h-3.5 w-3.5" />
            {login.isPending ? 'Checking credentials' : 'Sign in'}
          </button>
        </form>
        <div className="border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] md:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground)/.58)]">Access boundary</p>
          <p className="mt-12 text-2xl font-semibold tracking-[-0.035em]">One account. One tenant database.</p>
          <p className="mt-4 text-sm leading-6 text-[hsl(var(--primary-foreground)/.64)]">
            Sign in from a tenant subdomain so BisBy can resolve the correct local account store before checking workspace permissions.
          </p>
          <div className="mt-10 border-t border-[hsl(var(--primary-foreground)/.18)] pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground)/.5)]">
            Session expires after 8 hours
          </div>
        </div>
      </div>
      <div className="mt-8 border-t border-[hsl(var(--border))] pt-5">
        <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" data-testid="link-login-return">
          Return to entry
        </Link>
      </div>
    </RouteFrame>
  );
}

function AccessError({ status, moduleLetter, workspaceKey }: { status?: number; moduleLetter: ModuleLetter; workspaceKey: WorkspaceKey }) {
  const details = status === 401
    ? { code: '401', title: 'Identity required', body: 'This destination needs an authenticated local account before access can be resolved.' }
    : status === 403
      ? { code: '403', title: 'Destination not assigned', body: 'The account is known, but this tenant, module, or workspace is not assigned to it.' }
      : status === 404
        ? { code: '404', title: 'Destination not found', body: 'This route is valid in shape, but the requested tenant destination does not exist.' }
        : { code: '—', title: 'Access check unavailable', body: 'BisBy could not resolve this destination right now. The route remains intentionally blocked.' };
  return (
    <div className="mt-12 grid gap-6 border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--card)/.72)] p-6 md:grid-cols-[auto_1fr_auto] md:items-start md:p-8" data-testid={`status-route-error-${status ?? 'unknown'}`}>
      <div className="flex h-12 w-12 items-center justify-center bg-[hsl(var(--accent)/.16)] text-[hsl(var(--accent-foreground))]">
        {status === 401 ? <LockKeyhole className="h-5 w-5" /> : status === 403 ? <ShieldAlert className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-[hsl(var(--accent-foreground))]">HTTP {details.code}</span>
          <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
          <span className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">Route access</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{details.title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{details.body}</p>
         {status === 401 && (
           <Link href="/login" className="mt-5 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85" data-testid="link-route-login">
             <LogIn className="h-3.5 w-3.5" /> Open local sign in
           </Link>
         )}
      </div>
      <div className="border-l border-[hsl(var(--border))] pl-4 font-mono text-[10px] leading-5 text-[hsl(var(--muted-foreground))] md:justify-self-end">
        <span className="uppercase tracking-[0.14em]">Requested</span>
        <br />
        /{moduleLetter}/{workspaceKey}
      </div>
    </div>
  );
}

function AuthorizedDestination({ moduleLetter, workspaceKey, subdomain, tenantId }: { moduleLetter: ModuleLetter; workspaceKey: WorkspaceKey; subdomain: string; tenantId: string }) {
  const isDashboard = workspaceKey === 'ws-1';
  const destinationName = isDashboard ? 'Dashboard' : `Workspace ${workspaceKey.replace('ws-', '')}`;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    queryClient.clear();
    setLocation('/login');
  };

  return (
    <div className="mt-12 border border-[hsl(var(--secondary)/.6)] bg-[hsl(var(--card)/.8)]" data-testid="status-route-authorized">
      <div className="flex flex-col gap-5 border-b border-[hsl(var(--border))] p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-[hsl(var(--secondary)/.22)] text-[hsl(var(--secondary-foreground))]">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <StatusPill tone="good">authorized</StatusPill>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">Resolved destination</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5 md:justify-end">
          <div className="font-mono text-[10px] leading-5 text-[hsl(var(--muted-foreground))] md:text-right">
            <span className="text-[hsl(var(--foreground))]">{subdomain}.bisby.pro</span>
            <br />
            tenant {tenantId}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="inline-flex items-center gap-2 border border-[hsl(var(--border))] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] disabled:cursor-wait disabled:opacity-50"
            data-testid="button-logout"
          >
            <LogIn className="h-3.5 w-3.5 rotate-180" />
            {logout.isPending ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </div>
      <div className="p-6 md:p-8">
        <p className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl" data-testid="text-destination-under-construction">
          Module {moduleLetter.toUpperCase()} {destinationName} under construction
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="border border-[hsl(var(--border))] p-4">
              <div className="bisby-skeleton h-2.5 w-2/5" />
              <div className="bisby-skeleton mt-5 h-8 w-3/5" />
              <div className="bisby-skeleton mt-3 h-2 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleRoute() {
  const params = useParams<{ moduleLetter?: string }>();
  const rawLetter = params.moduleLetter ?? '';
  const letter = rawLetter.toLowerCase();
  if (!isModuleLetter(letter)) return <InvalidRoute requested={`/${rawLetter}`} reason="Module letters run from a through h." />;
  return <DestinationRoute moduleLetter={letter} workspaceNumber="1" isDashboard />;
}

function WorkspaceRoute() {
  const params = useParams<{ moduleLetter?: string; workspaceKey?: string }>();
  const rawLetter = params.moduleLetter ?? '';
  const letter = rawLetter.toLowerCase();
  const rawWorkspaceKey = params.workspaceKey ?? '';
  const workspaceNumber = rawWorkspaceKey.replace(/^ws-/, '');
  if (!isModuleLetter(letter)) return <InvalidRoute requested={`/${rawLetter}/ws-${workspaceNumber}`} reason="Module letters run from a through h." />;
  const workspaceKey = workspaceKeyFor(workspaceNumber);
  if (!workspaceKey) return <InvalidRoute requested={`/${letter}/ws-${workspaceNumber}`} reason="Workspace numbers run from 1 through 10." />;
  return <DestinationRoute moduleLetter={letter} workspaceNumber={workspaceNumber} />;
}

function DestinationRoute({ moduleLetter, workspaceNumber, isDashboard = false }: { moduleLetter: ModuleLetter; workspaceNumber: string; isDashboard?: boolean }) {
  const moduleKey = moduleKeys[moduleLetter];
  const workspaceKey = `ws-${workspaceNumber}` as WorkspaceKey;
  const access = useGetRouteAccess(moduleKey, workspaceKey, {
    query: { queryKey: getGetRouteAccessQueryKey(moduleKey, workspaceKey) },
  });
  const title = isDashboard ? `Module ${moduleLetter.toUpperCase()} dashboard` : `Module ${moduleLetter.toUpperCase()} workspace ${workspaceNumber}`;
  return (
    <RouteFrame eyebrow={`BisBy / module ${moduleLetter.toUpperCase()} / ${workspaceKey}`} title={title}>
      {access.isLoading ? <LoadingState label={workspaceKey} /> : access.isError ? <AccessError status={getErrorStatus(access.error)} moduleLetter={moduleLetter} workspaceKey={workspaceKey} /> : access.data ? <AuthorizedDestination moduleLetter={moduleLetter} workspaceKey={workspaceKey} subdomain={access.data.subdomain} tenantId={access.data.tenantId} /> : <AccessError moduleLetter={moduleLetter} workspaceKey={workspaceKey} />}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-5">
        <Link href="/" className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" data-testid="link-return-entry">
          <Terminal className="h-3.5 w-3.5" /> Return to entry
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">No module functionality is enabled</span>
      </div>
    </RouteFrame>
  );
}

function InvalidRoute({ requested, reason }: { requested: string; reason: string }) {
  return (
    <RouteFrame eyebrow="BisBy / route boundary" title="This destination is not built.">
      <div className="mt-12 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.74)] p-6 md:p-8" data-testid="status-route-invalid">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[hsl(var(--muted))]">
            <Grid2X2 className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Invalid route shape</p>
            <p className="mt-3 break-all font-mono text-sm text-[hsl(var(--foreground))]">{requested || '/'}</p>
            <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{reason}</p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3 border-t border-[hsl(var(--border))] pt-5">
          <Link href="/" className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85" data-testid="link-invalid-return">
            <RotateCcw className="h-3.5 w-3.5" /> Return to entry
          </Link>
          <Link href="/a/ws-1" className="inline-flex items-center gap-2 border border-[hsl(var(--border))] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]" data-testid="link-invalid-example">
            Open route example <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </RouteFrame>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={RootHome} />
        <Route path="/owner/login" component={OwnerLogin} />
        <Route path="/owner/dashboard" component={OwnerDashboard} />
        <Route path="/login" component={Login} />
        <Route path="/:moduleLetter/:workspaceKey" component={WorkspaceRoute} />
        <Route path="/:moduleLetter" component={ModuleRoute} />
        <Route component={() => <InvalidRoute requested={window.location.pathname} reason="Use /a through /h, or /a/ws-1 through /h/ws-10." />} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
