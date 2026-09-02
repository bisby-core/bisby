import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  ArrowLeft,
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
} from 'lucide-react';
import {
  useGetPublicTenantWorkspaces,
  getGetPublicTenantWorkspacesQueryKey,
  getGetContentAccessQueryKey,
  getGetRouteAccessQueryKey,
  getGetTenantAdminQueryKey,
  getGetCurrentUserQueryKey,
  ModuleKey,
  type AuthenticatedLocalUser,
  type ManagedWorkspaceOption,
  type PublicWorkspace,
  setBaseUrl,
  useChangePassword,
  useLogin,
  useLogout,
  useGetCurrentUser,
  useGetTenantAdmin,
  useGetCustomerContext,
  getGetCustomerContextQueryKey,
  useGetContentAccess,
  useGetRouteAccess,
  useGetTenantAdminStaffWorkspaceAccess,
  getGetTenantAdminStaffWorkspaceAccessQueryKey,
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
import { OwnerControlPlane, OwnerHome } from '@/owner/OwnerControlPlane';
import { AdminControlPlane } from '@/admin/AdminControlPlane';
import { PlatformStaffChangePassword, PlatformStaffHome, PlatformStaffLogin } from '@/platform-staff/PlatformStaffPortal';
import { BISBY_ROOT_DOMAIN } from '@/config';

const queryClient = new QueryClient();

export const moduleLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export type ModuleLetter = (typeof moduleLetters)[number];

export const moduleKeys: Record<ModuleLetter, ModuleKey> = {
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
  return Number.isSafeInteger(numeric) && numeric >= 1
    ? `ws-${numeric}`
    : null;
};

const developmentPlane = (
  import.meta.env.VITE_BISBY_DEV_PLANE as string | undefined
)?.toLowerCase();

if (
  import.meta.env.DEV &&
  developmentPlane === 'design'
) {
  setBaseUrl('/__bisby-dev/design');
} else {
  setBaseUrl(null);
}

const developmentTenantName = developmentPlane === 'design' ? 'Design' : null;

const tenantPlaneHref = (path: string): string =>
  path;

export const customerNameFromHostname = (hostname: string): string | null => {
  if (import.meta.env.DEV && developmentTenantName) {
    return developmentTenantName;
  }

  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  const suffix = `.${BISBY_ROOT_DOMAIN}`;
  if (!normalizedHostname.endsWith(suffix)) return null;

  const subdomain = normalizedHostname.slice(0, -suffix.length);
  if (subdomain === 'www') return null;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) return null;

  return subdomain
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

/** The registry value is authoritative; hostname formatting is only transitional. */
export function useCustomerName(): string | null {
  const context = useGetCustomerContext({
    query: {
      queryKey: getGetCustomerContextQueryKey(),
      enabled: !isRootHostname(window.location.hostname),
      retry: false,
    },
  });
  return context.data?.customerName ?? customerNameFromHostname(window.location.hostname);
}

const isRootHostname = (hostname: string): boolean => {
  if (import.meta.env.DEV && developmentPlane) {
    return developmentPlane === 'platform';
  }

  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  return (
    normalizedHostname === BISBY_ROOT_DOMAIN ||
    normalizedHostname === `www.${BISBY_ROOT_DOMAIN}` ||
    (import.meta.env.DEV &&
      (normalizedHostname === 'localhost' ||
        normalizedHostname === '127.0.0.1' ||
        normalizedHostname.endsWith('.replit.dev')))
  );
};

export const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  return candidate.status ?? candidate.statusCode ?? candidate.response?.status;
};

export function BrandMark() {
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
  const currentUser = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
      enabled: !isRootHostname(window.location.hostname),
    },
  });
  const customerName = useCustomerName();
  const visibleModuleLetters =
    currentUser.data?.role === 'module_admin' ||
    currentUser.data?.role === 'module_staff' ||
    currentUser.data?.role === 'client'
      ? moduleLetters.filter(
          (letter) => moduleKeys[letter] === currentUser.data?.moduleKey,
        )
      : moduleLetters;
  return (
    <div className="bisby-noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[232px] flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-5 py-6 md:flex">
        <BrandMark />
        <div className="mt-14">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--sidebar-foreground)/.48)]">
            Modules
          </p>
          <nav className="space-y-1" aria-label="Module navigation">
            {visibleModuleLetters.map((letter) => (
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
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">{customerName ? `${customerName} isolated` : 'Customer isolated'}</span>
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
          {customerName ? `${customerName} scoped` : 'Customer scoped'}
        </div>
      </header>
      <main className="md:ml-[232px]">{children}</main>
    </div>
  );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
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

export function RouteFrame({ eyebrow, title, children, footer }: { eyebrow: string; title: string; children: ReactNode; footer?: ReactNode }) {
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

function Home() {
  const health = useHealthCheck();
  const publicData = useGetPublicTenantWorkspaces({
    query: {
      enabled: !isRootHostname(window.location.hostname),
      retry: false,
      queryKey: getGetPublicTenantWorkspacesQueryKey()
    }
  });
  if (isRootHostname(window.location.hostname)) {
    return <OwnerControlPlane rootDomain={BISBY_ROOT_DOMAIN} />;
  }
  const healthStatus = health.isLoading ? 'checking' : health.isError ? 'unavailable' : 'reachable';
  const customerName = useCustomerName();
  const tenantPublicWorkspaces = (publicData.data?.workspaces ?? []).filter(
    (workspace) => workspace.scope === 'tenant',
  );
  return (
    <RouteFrame eyebrow="BisBy / entry point" title={customerName ? `${customerName} Entry Portal` : 'A precise way in.'}>
      <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="bisby-reveal border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 [animation-delay:160ms] md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Customer URL format</p>
              <p className="mt-5 break-all font-mono text-lg leading-relaxed text-[hsl(var(--foreground))] md:text-2xl">
                <span className="text-[hsl(var(--accent))]">{'{customer}'}</span>
                <span className="text-[hsl(var(--muted-foreground))]">.{BISBY_ROOT_DOMAIN}/</span>
                <span className="text-[hsl(var(--secondary-foreground))]">a</span>
                <span className="text-[hsl(var(--muted-foreground))]">/ws-</span>
                <span className="text-[hsl(var(--secondary-foreground))]">1</span>
              </p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div className="mt-8 grid gap-3 border-t border-[hsl(var(--border))] pt-5 text-sm leading-6 text-[hsl(var(--muted-foreground))] md:grid-cols-2">
            <p>Each customer arrives through its own subdomain. The path selects the module and, when present, the workspace.</p>
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
                  {customerName ? 'Authorized access point' : 'Destination pending'}
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--primary-foreground)/.62)]">
                  {customerName ? `Welcome back, ${customerName} Team.` : 'Awaiting a customer path.'}
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
              <Link key={letter} href={tenantPlaneHref(`/${letter}`)} className="group flex items-center gap-2 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]" data-testid={`link-entry-module-${letter}`}>
                {letter}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </div>


      <PublicWorkspaceLinks
        workspaces={tenantPublicWorkspaces}
        label={customerName ? `${customerName} public entries` : 'Customer public entries'}
        animationDelay="360ms"
      />

      <div className="bisby-reveal mt-6 border-t border-[hsl(var(--border))] pt-6 [animation-delay:400ms]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">organization administration access</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Sign in with a tenant admin account to open {customerName ? `${customerName} Admin Controls` : 'Tenant Admin Controls'}.</p>
          </div>
          <div>
            <Link href={tenantPlaneHref('/login')} className="group flex items-center gap-2 border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.15)] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--secondary-foreground))] transition-colors hover:border-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--secondary-foreground))]" data-testid="link-home-admin-sign-in">
              <LogIn className="h-3.5 w-3.5" /> organization administrator sign-in
            </Link>
          </div>
        </div>
      </div>
    </RouteFrame>
  );
}

function DevelopmentDesignHome() {
  const [, setLocation] = useLocation();
  const currentUser = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (currentUser.data?.role === 'tenant_admin') {
      setLocation('/admin');
    } else if (currentUser.isError) {
      setLocation('/login');
    }
  }, [currentUser.data?.role, currentUser.isError, setLocation]);

  if (
    currentUser.isLoading ||
    currentUser.isError ||
    currentUser.data?.role === 'tenant_admin'
  ) {
    return (
      <RouteFrame eyebrow="BisBy / Design studio" title="Opening Design Admin Controls">
        <LoadingState label="Design administration session" />
      </RouteFrame>
    );
  }

  return <Home />;
}

export function LoadingState({ label }: { label: string }) {
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
  const customerName = useCustomerName();
  const customerLabel = customerName ?? 'your organization';
  const entryHref = '/';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedUsername = String(formData.get('username') ?? '');
    const submittedPassword = String(formData.get('password') ?? '');
    try {
      const account = await login.mutateAsync({
        data: {
          username: submittedUsername,
          password: submittedPassword,
        },
      });
      await queryClient.invalidateQueries();
      setPassword('');
      if (account.requiresPasswordChange) {
        setLocation('/change-password');
      } else if (account.role === 'tenant_admin_staff') {
        setLocation(`/tenant-admin-staff/${account.workspaceKeys[0]}`);
      } else if (account.role === 'tenant_admin') {
        setLocation('/admin');
      } else if (account.role === 'module_admin') {
        const moduleLetter = account.moduleKey?.replace('module_', '');
        setLocation(moduleLetter ? `/${moduleLetter}/admin` : '/');
      } else {
        const mod = account.moduleKey ? account.moduleKey.replace('module_', '') : 'a';
        const ws = account.workspaceKeys && account.workspaceKeys.length > 0 ? account.workspaceKeys[0] : 'ws-1';
        setLocation(`/${mod}/${ws}`);
      }
    } catch {
      // The mutation state renders the safe API error below.
    }
  };

  const errorStatus = getErrorStatus(login.error);
  return (
    <RouteFrame eyebrow={`BisBy / ${customerName ? `${customerName} ` : ''}local access`} title={`Sign in to ${customerLabel}.`}>
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
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">{customerName ?? 'Customer'}-local account</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Credentials stay inside the resolved {customerLabel} database.</p>
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
               {errorStatus === 401 ? 'The username or password was not accepted.' : 'This organization could not complete the sign-in request.'}
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
           <p className="mt-12 text-2xl font-semibold tracking-[-0.035em]">One account. One {customerLabel} database.</p>
          <p className="mt-4 text-sm leading-6 text-[hsl(var(--primary-foreground)/.64)]">
             Sign in from the {customerLabel} customer subdomain so BisBy can resolve the correct local account store before checking workspace permissions.
          </p>
          <div className="mt-10 border-t border-[hsl(var(--primary-foreground)/.18)] pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground)/.5)]">
            Session expires after 8 hours
          </div>
        </div>
      </div>
      <div className="mt-8 border-t border-[hsl(var(--border))] pt-5">
        <Link href={entryHref} className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" data-testid="link-login-return">
          Return to entry
        </Link>
      </div>
    </RouteFrame>
  );
}

function ChangePassword() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useGetCurrentUser();
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');
    if (newPassword !== confirmation) {
      setValidationError('The new passwords do not match.');
      return;
    }

    try {
      await changePassword.mutateAsync({
        data: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      await queryClient.invalidateQueries();

      const user = currentUser.data;
      if (user) {
        if (user.role === 'tenant_admin_staff') {
          setLocation(`/tenant-admin-staff/${user.workspaceKeys[0]}`);
        } else if (user.role === 'tenant_admin') {
          setLocation('/admin');
        } else if (user.role === 'module_admin') {
          const moduleLetter = user.moduleKey?.replace('module_', '');
          setLocation(moduleLetter ? `/${moduleLetter}/admin` : '/');
        } else {
          const mod = user.moduleKey ? user.moduleKey.replace('module_', '') : 'a';
          const ws = user.workspaceKeys && user.workspaceKeys.length > 0 ? user.workspaceKeys[0] : 'ws-1';
          setLocation(`/${mod}/${ws}`);
        }
      } else {
        setLocation('/a/ws-1');
      }
    } catch {
      // The mutation state renders the safe API error below.
    }
  };

  const errorStatus = getErrorStatus(changePassword.error);
  return (
    <RouteFrame eyebrow="BisBy / organization security" title="Set your permanent password.">
      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <form
          onSubmit={handleSubmit}
          className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 md:p-8"
          data-testid="form-change-password"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[hsl(var(--secondary)/.22)] text-[hsl(var(--secondary-foreground))]">
              <LockKeyhole className="h-4 w-4" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">First-login requirement</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Replace the temporary credential before entering a workspace.</p>
            </div>
          </div>
          {[
            {
              id: 'current-password',
              label: 'Current temporary password',
              value: currentPassword,
              setValue: setCurrentPassword,
              autoComplete: 'current-password',
            },
            {
              id: 'new-password',
              label: 'New permanent password',
              value: newPassword,
              setValue: setNewPassword,
              autoComplete: 'new-password',
            },
            {
              id: 'confirm-password',
              label: 'Confirm new password',
              value: confirmation,
              setValue: setConfirmation,
              autoComplete: 'new-password',
            },
          ].map((field, index) => (
            <label
              key={field.id}
              className={`${index === 0 ? 'mt-10' : 'mt-6'} block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]`}
              htmlFor={field.id}
            >
              {field.label}
              <input
                id={field.id}
                type="password"
                value={field.value}
                onChange={(event) => field.setValue(event.target.value)}
                autoComplete={field.autoComplete}
                minLength={index === 0 ? 1 : 8}
                maxLength={255}
                required
                className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none transition-colors focus:border-[hsl(var(--ring))]"
                data-testid={`input-${field.id}`}
              />
            </label>
          ))}
          {(validationError || changePassword.isError) && (
            <p className="mt-5 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm leading-6 text-[hsl(var(--accent-foreground))]" data-testid="status-change-password-error">
              {validationError ||
                (errorStatus === 401
                  ? 'The current password was not accepted.'
                  : 'The password could not be changed safely.')}
            </p>
          )}
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="mt-8 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
            data-testid="button-change-password"
          >
            <LockKeyhole className="h-3.5 w-3.5" />
            {changePassword.isPending ? 'Saving permanent password' : 'Set permanent password'}
          </button>
        </form>
        <section className="border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] md:p-8">
          <ShieldAlert className="h-8 w-8 text-[hsl(var(--secondary))]" />
          <p className="mt-12 text-2xl font-semibold tracking-[-0.035em]">Workspace access remains locked.</p>
          <p className="mt-4 text-sm leading-6 text-[hsl(var(--primary-foreground)/.64)]">
            The permanent password is stored only as a customer-local scrypt hash. Your temporary credential stops working after this change.
          </p>
        </section>
      </div>
    </RouteFrame>
  );
}

function AccessError({ status, moduleLetter, workspaceKey }: { status?: number; moduleLetter: ModuleLetter; workspaceKey: WorkspaceKey }) {
  const details = status === 401
    ? { code: '401', title: 'Identity required', body: 'This destination needs an authenticated local account before access can be resolved.' }
    : status === 428
      ? { code: '428', title: 'Permanent password required', body: 'This account must replace its temporary password before workspace access can be resolved.' }
    : status === 403
      ? { code: '403', title: 'Destination not assigned', body: 'The account is known, but this customer space, module, or workspace is not assigned to it.' }
      : status === 404
        ? { code: '404', title: 'Destination not found', body: 'This route is valid in shape, but the requested customer destination does not exist.' }
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
         {(status === 401 || status === 428) && (
            <Link href={status === 428 ? '/change-password' : '/login'} className="mt-5 inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85" data-testid={status === 428 ? 'link-route-change-password' : 'link-route-login'}>
              <LogIn className="h-3.5 w-3.5" /> {status === 428 ? 'Set permanent password' : 'Open local sign in'}
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

function AuthorizedDestination({ moduleLetter, workspaceKey, subdomain, customerName }: { moduleLetter: ModuleLetter; workspaceKey: WorkspaceKey; subdomain: string; customerName: string }) {
  const isDashboard = workspaceKey === 'ws-1';
  const destinationName = isDashboard ? 'Dashboard' : `Workspace ${workspaceKey.replace('ws-', '')}`;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const moduleKey = moduleKeys[moduleLetter];
  const pageAccess = useGetContentAccess(moduleKey, workspaceKey, 'page', 'workspace', {
    query: { queryKey: getGetContentAccessQueryKey(moduleKey, workspaceKey, 'page', 'workspace') },
  });
  const overviewAccess = useGetContentAccess(moduleKey, workspaceKey, 'tab', 'overview', {
    query: { queryKey: getGetContentAccessQueryKey(moduleKey, workspaceKey, 'tab', 'overview') },
  });

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
             <span className="text-[hsl(var(--foreground))]">{subdomain}.{BISBY_ROOT_DOMAIN}</span>
            <br />
            {customerName}
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
      <div className="p-6 md:p-8" id="workspace-page">
        {pageAccess.isLoading ? (
          <LoadingState label="workspace content" />
        ) : pageAccess.isError ? (
          <div className="border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--accent)/.08)] p-5" data-testid="status-content-unavailable">
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--accent-foreground))]">
              Workspace content is not available
            </p>
          </div>
        ) : (
          <>
        <nav className="mb-8 flex flex-wrap gap-2 border-b border-[hsl(var(--border))] pb-4" aria-label="Workspace page navigation">
          {pageAccess.data?.canView ? (
            <Link
              href={`/${moduleLetter}/${workspaceKey}#workspace-page`}
              className="border border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--foreground))]"
              data-testid="link-module-page-workspace"
            >
              Workspace
            </Link>
          ) : null}
          {overviewAccess.data?.canView ? (
            <Link
              href={`/${moduleLetter}/${workspaceKey}#overview-tab`}
              className="border border-[hsl(var(--border))] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]"
              data-testid="link-module-tab-overview"
            >
              Overview
            </Link>
          ) : null}
        </nav>
        <p className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl" data-testid="text-destination-under-construction">
          Module {moduleLetter.toUpperCase()} {destinationName} under construction
        </p>
        {overviewAccess.isLoading ? (
          <LoadingState label="workspace overview" />
        ) : overviewAccess.isError ? (
          <div className="mt-8 border border-[hsl(var(--border))] p-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            Overview is not available
          </div>
        ) : (
          <div className="mt-8 grid gap-3 md:grid-cols-3" id="overview-tab">
            <ProtectedWorkspaceCard moduleKey={moduleKey} workspaceKey={workspaceKey} nodeKey="destination-status" />
            <ProtectedWorkspaceCard moduleKey={moduleKey} workspaceKey={workspaceKey} nodeKey="access-boundary" />
            <ProtectedWorkspaceCard moduleKey={moduleKey} workspaceKey={workspaceKey} nodeKey="session-status" />
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function ProtectedWorkspaceCard({
  moduleKey,
  workspaceKey,
  nodeKey,
}: {
  moduleKey: ModuleKey;
  workspaceKey: WorkspaceKey;
  nodeKey: string;
}) {
  const access = useGetContentAccess(moduleKey, workspaceKey, 'card', nodeKey, {
    query: {
      queryKey: getGetContentAccessQueryKey(moduleKey, workspaceKey, 'card', nodeKey),
    },
  });
  if (access.isError) return null;
  return (
    <div className="border border-[hsl(var(--border))] p-4" data-testid={`card-workspace-content-${nodeKey}`}>
      <div className="bisby-skeleton h-2.5 w-2/5" />
      <div className="bisby-skeleton mt-5 h-8 w-3/5" />
      <div className="bisby-skeleton mt-3 h-2 w-4/5" />
      {access.data?.accessLevel && access.data.accessLevel !== 'active' ? (
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
          {access.data.accessLevel.replace('_', ' ')}
        </p>
      ) : null}
    </div>
  );
}

function ModuleRoute() {
  const [, setLocation] = useLocation();
  const params = useParams<{ moduleLetter?: string }>();
  const rawLetter = params.moduleLetter ?? '';
  const letter = rawLetter.toLowerCase();

  const currentUser = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });

  useEffect(() => {
    if (currentUser.data && isModuleLetter(letter)) {
      if (currentUser.data.role === 'tenant_admin' || (currentUser.data.role === 'module_admin' && currentUser.data.moduleKey === moduleKeys[letter])) {
        setLocation(`/${letter}/admin`);
      }
    }
  }, [currentUser.data?.role, currentUser.data?.moduleKey, letter, setLocation]);

  if (!isModuleLetter(letter)) return <InvalidRoute requested={`/${rawLetter}`} reason="Module letters run from a through h." />;

  if (currentUser.isLoading) {
     return <RouteFrame eyebrow="BisBy / resolving" title="Resolving destination"><LoadingState label="Module destination" /></RouteFrame>;
  }

  return <DestinationRoute moduleLetter={letter} workspaceNumber="1" isDashboard />;
}

function TenantAdminStaffWorkspaceRoute() {
  const params = useParams<{ workspaceKey?: string }>();
  const workspaceKey = params.workspaceKey ?? '';
  const currentUser = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const customerName = useCustomerName() ?? 'Customer';
  const staffAccess = useGetTenantAdminStaffWorkspaceAccess(workspaceKey, {
    query: {
      queryKey: getGetTenantAdminStaffWorkspaceAccessQueryKey(workspaceKey),
      enabled: currentUser.data?.role === 'tenant_admin_staff',
      retry: false,
    },
  });
  if (currentUser.isLoading) {
    return <RouteFrame eyebrow="BisBy / organization administration" title={`Opening ${customerName} Admin Staff Workspace`}><LoadingState label="Admin Staff Workspace" /></RouteFrame>;
  }
  const staffUser = currentUser.data?.role === 'tenant_admin_staff' ? currentUser.data : null;
  const authorized = Boolean(staffUser?.workspaceKeys.includes(workspaceKey) && staffAccess.isSuccess);
  if (!authorized) {
    return <RouteFrame eyebrow="BisBy / organization administration" title="Destination not assigned"><AccessError status={currentUser.isError ? 401 : 403} moduleLetter="a" workspaceKey={'ws-1' as WorkspaceKey} /></RouteFrame>;
  }
  return (
    <RouteFrame eyebrow="BisBy / organization administration" title={`${customerName} Admin Staff Workspace ${workspaceKey}`}>
      <div className="mt-12 border border-[hsl(var(--secondary)/.6)] bg-[hsl(var(--card)/.8)] p-6 md:p-8">
        <StatusPill tone="good">authorized</StatusPill>
        <p className="mt-5 text-2xl font-semibold tracking-[-0.035em]">This {customerName} Admin Staff Workspace is under construction.</p>
        <nav className="mt-8 flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-5" aria-label={`${customerName} Admin Staff Workspaces`}>
          {staffUser?.workspaceKeys.map((key) => <Link key={key} href={`/tenant-admin-staff/${key}`} className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${key === workspaceKey ? 'border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'}`} data-testid={`link-tenant-admin-staff-workspace-${key}`}>{key}</Link>)}
        </nav>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 border border-[hsl(var(--border))] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"><ArrowLeft className="h-3.5 w-3.5" /> Exit to Customer Entry Portal</Link>
      </div>
    </RouteFrame>
  );
}

function LocalAdminHome({ moduleLetter }: { moduleLetter?: string }) {
  const [, setLocation] = useLocation();
  const currentUser = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const customerName = useCustomerName() ?? 'Customer';
  const normalizedLetter = moduleLetter?.toLowerCase();
  const moduleKey =
    normalizedLetter && isModuleLetter(normalizedLetter)
      ? moduleKeys[normalizedLetter]
      : null;
  const authorized = normalizedLetter
    ? moduleKey !== null &&
      (currentUser.data?.role === 'tenant_admin' ||
        (currentUser.data?.role === 'module_admin' &&
          currentUser.data.moduleKey === moduleKey))
    : currentUser.data?.role === 'tenant_admin';
  const homeTitle = normalizedLetter
    ? `Module ${normalizedLetter.toUpperCase()} Home`
    : `${customerName} Home`;
  const dashboardTitle = normalizedLetter
    ? `Module ${normalizedLetter.toUpperCase()} Dashboard`
    : `${customerName} Dashboard`;
  const homeHref = normalizedLetter
    ? `/module/${normalizedLetter}/home`
    : '/tenant/home';
  const adminHref = normalizedLetter ? `/${normalizedLetter}/admin` : '/admin';

  useEffect(() => {
    if (currentUser.isError) setLocation('/login');
    else if (currentUser.data?.requiresPasswordChange) setLocation('/change-password');
  }, [currentUser.data?.requiresPasswordChange, currentUser.isError, setLocation]);

  if (currentUser.isLoading) {
    return <RouteFrame eyebrow="BisBy / admin home" title={homeTitle}><LoadingState label="Admin Home" /></RouteFrame>;
  }
  if (!currentUser.data || currentUser.data.requiresPasswordChange) return null;
  if (!authorized) {
    return (
      <RouteFrame eyebrow="BisBy / admin home" title={homeTitle}>
        <div className="mt-12 border border-[hsl(var(--accent)/.52)] p-6">
          <p className="font-mono text-xs uppercase tracking-[0.15em]">Insufficient Privileges</p>
        </div>
      </RouteFrame>
    );
  }

  return (
    <div className="bisby-noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-5 py-6 md:min-h-[100dvh] md:border-b-0 md:border-r">
        <BrandMark />
        {normalizedLetter ? (
          <div className="mt-10">
            <p className="text-xl font-semibold tracking-[-0.035em] text-[hsl(var(--sidebar-foreground))]">
              {customerName}
            </p>
            <h1 className="mt-1 text-base font-medium tracking-[-0.02em] text-[hsl(var(--sidebar-foreground)/.76)]">
              {homeTitle}
            </h1>
          </div>
        ) : (
          <h1 className="mt-10 text-2xl font-semibold tracking-[-0.035em] text-[hsl(var(--sidebar-foreground))]">{homeTitle}</h1>
        )}
        <nav className="mt-8" aria-label={homeTitle}>
          <Link
            href={`${homeHref}/dashboard`}
            className="flex border-l-2 border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-accent))] px-3 py-3 font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--sidebar-foreground))]"
            data-testid={normalizedLetter ? `link-module-${normalizedLetter}-dashboard` : 'link-tenant-dashboard'}
          >
            Dashboard
          </Link>
        </nav>
        <Link href={adminHref} className="mt-10 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--sidebar-foreground)/.64)]">
          <ArrowLeft className="h-3.5 w-3.5" />
          {normalizedLetter
            ? `Module ${normalizedLetter.toUpperCase()} Admin Controls`
            : `${customerName} Admin Controls`}
        </Link>
      </aside>
      <main className="bisby-grid min-h-[100dvh] px-5 py-10 md:px-12 md:py-14">
        {normalizedLetter ? (
          <p className="mb-2 text-base font-medium tracking-[-0.015em] text-[hsl(var(--muted-foreground))]" data-testid="text-module-tenant-name">
            {customerName}
          </p>
        ) : null}
        <h2 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl" data-testid={normalizedLetter ? `title-module-${normalizedLetter}-dashboard` : 'title-tenant-dashboard'}>
          {dashboardTitle}
        </h2>
      </main>
    </div>
  );
}

function WorkspaceRoute() {
  const params = useParams<{ moduleLetter?: string; workspaceKey?: string }>();
  const rawLetter = params.moduleLetter ?? '';
  const letter = rawLetter.toLowerCase();
  const rawWorkspaceKey = params.workspaceKey ?? '';
  const workspaceNumber = rawWorkspaceKey.replace(/^ws-/, '');
  if (!isModuleLetter(letter)) return <InvalidRoute requested={`/${rawLetter}/ws-${workspaceNumber}`} reason="Module letters run from a through h." />;
  const workspaceKey = workspaceKeyFor(workspaceNumber);
  if (!workspaceKey) return <InvalidRoute requested={`/${letter}/ws-${workspaceNumber}`} reason="Workspace numbers must be positive whole numbers." />;
  return <DestinationRoute moduleLetter={letter} workspaceNumber={workspaceNumber} />;
}

function DestinationRoute({ moduleLetter, workspaceNumber, isDashboard = false }: { moduleLetter: ModuleLetter; workspaceNumber: string; isDashboard?: boolean }) {
  const customerName = useCustomerName() ?? 'Customer';
  const moduleKey = moduleKeys[moduleLetter];
  const workspaceKey = `ws-${workspaceNumber}` as WorkspaceKey;
  const access = useGetRouteAccess(moduleKey, workspaceKey, {
    query: { queryKey: getGetRouteAccessQueryKey(moduleKey, workspaceKey) },
  });
  const currentUser = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
    },
  });
  const administration = useGetTenantAdmin({
    query: {
      queryKey: getGetTenantAdminQueryKey(),
      enabled:
        currentUser.data?.role === 'tenant_admin' ||
        currentUser.data?.role === 'module_admin',
      retry: false,
    },
  });
  const publicData = useGetPublicTenantWorkspaces({
    query: {
      retry: false,
      queryKey: getGetPublicTenantWorkspacesQueryKey(),
    },
  });
  const modulePublicWorkspaces = (publicData.data?.workspaces ?? []).filter(
    (workspace) =>
      workspace.scope === 'module' && workspace.moduleKey === moduleKey,
  );
  const title = isDashboard ? `Module ${moduleLetter.toUpperCase()} dashboard` : `Module ${moduleLetter.toUpperCase()} workspace ${workspaceNumber}`;

  if (currentUser.data?.role === 'tenant_admin_staff') {
    return (
      <RouteFrame eyebrow={`${customerName} / module ${moduleLetter.toUpperCase()} / denied`} title="Destination not assigned">
        <AccessError
          status={403}
          moduleLetter={moduleLetter}
          workspaceKey={workspaceKey}
        />
      </RouteFrame>
    );
  }

  return (
    <RouteFrame eyebrow={`${customerName} / module ${moduleLetter.toUpperCase()} / ${workspaceKey}`} title={title}>
      {!currentUser.isLoading && currentUser.data ? (
        <ModuleNavigation
          currentUser={currentUser.data}
          moduleLetter={moduleLetter}
          workspaceKey={workspaceKey}
          managedWorkspaces={administration.data?.workspaces}
        />
      ) : null}
      {access.isLoading ? <LoadingState label={workspaceKey} /> : access.isError ? <AccessError status={getErrorStatus(access.error)} moduleLetter={moduleLetter} workspaceKey={workspaceKey} /> : access.data ? <AuthorizedDestination moduleLetter={moduleLetter} workspaceKey={workspaceKey} subdomain={access.data.subdomain} customerName={access.data.customerName} /> : <AccessError moduleLetter={moduleLetter} workspaceKey={workspaceKey} />}
      <PublicWorkspaceLinks
        workspaces={modulePublicWorkspaces}
        label={`Module ${moduleLetter.toUpperCase()} public surfaces`}
      />
      <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t border-[hsl(var(--border))] pt-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">No module functionality is enabled</span>
      </div>
    </RouteFrame>
  );
}

function ModuleNavigation({
  currentUser,
  moduleLetter,
  workspaceKey,
  managedWorkspaces,
}: {
  currentUser: AuthenticatedLocalUser;
  moduleLetter: ModuleLetter;
  workspaceKey: WorkspaceKey;
  managedWorkspaces?: readonly ManagedWorkspaceOption[];
}) {
  const customerName = useCustomerName();
  const assignedWorkspaceKeys =
    currentUser.role === 'tenant_admin' || currentUser.role === 'module_admin'
      ? (managedWorkspaces ?? [])
          .filter((workspace) => workspace.moduleKey === moduleKeys[moduleLetter])
          .map((workspace) => workspace.workspaceKey)
      : currentUser.workspaceKeys ?? [];
  const visibleWorkspaces = Array.from(
    new Set([
      ...assignedWorkspaceKeys,
      workspaceKey,
    ]),
  ).sort((left, right) => {
    const leftNumber = Number(left.replace('ws-', ''));
    const rightNumber = Number(right.replace('ws-', ''));
    return leftNumber - rightNumber;
  });
  const isTenantAdmin = currentUser.role === 'tenant_admin';
  const isModuleAdmin = currentUser.role === 'module_admin';
  const isExactModuleAdmin =
    isModuleAdmin && currentUser.moduleKey === moduleKeys[moduleLetter];
  const returnHref = isTenantAdmin
    ? '/admin'
    : isModuleAdmin
      ? `/${moduleLetter}/admin`
      : tenantPlaneHref('/');
  const returnLabel = isTenantAdmin
    ? `Return to ${customerName ?? 'Tenant'} Admin Controls`
    : isModuleAdmin
      ? `Module ${moduleLetter.toUpperCase()} Admin Controls`
      : 'Exit to Customer Entry Portal';

  return (
    <div className="mt-10 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.62)]" data-testid="module-navigation">
      <div className="flex flex-col gap-5 border-b border-[hsl(var(--border))] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            Module {moduleLetter.toUpperCase()} navigation
          </p>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Move between your available Module {moduleLetter.toUpperCase()} destinations.
          </p>
        </div>
        <Link
          href={returnHref}
          className="inline-flex items-center gap-2 border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85"
          data-testid={isTenantAdmin ? 'link-return-administration' : isModuleAdmin ? 'link-module-administration' : 'link-exit-tenant-entry'}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {returnLabel}
        </Link>
      </div>
      <div className="p-5">
        <nav aria-label={`Module ${moduleLetter.toUpperCase()} workspaces`}>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            Workspaces
          </p>
          <div className="flex flex-wrap gap-2">
            {(isTenantAdmin || isExactModuleAdmin) && (
              <Link
                href={`/${moduleLetter}/admin`}
                className="group flex items-center justify-between border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/.08)] hover:text-[hsl(var(--foreground))]"
                data-testid={`link-nav-admin`}
              >
                Module {moduleLetter.toUpperCase()} Admin Controls
              </Link>
            )}
            {visibleWorkspaces.map((key) => (
              <Link
                key={key}
                href={`/${moduleLetter}/${key}`}
                className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                  key === workspaceKey
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--foreground))]'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
                }`}
                data-testid={`link-workspace-navigation-${key}`}
              >
                {key === 'ws-1' ? 'Dashboard' : `Workspace ${key.replace('ws-', '')}`}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function PublicWorkspaceLinks({
  workspaces,
  label,
  animationDelay,
}: {
  workspaces: readonly PublicWorkspace[];
  label: string;
  animationDelay?: string;
}) {
  if (workspaces.length === 0) return null;

  return (
    <div
      className="bisby-reveal mt-6 border-t border-[hsl(var(--border))] pt-6"
      style={animationDelay ? { animationDelay } : undefined}
      data-testid="public-workspace-links"
    >
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {workspaces.map((workspace) => {
          const moduleLetter = workspace.moduleKey?.replace('module_', '');
          const path = workspace.scope === 'module'
            ? `/public/module/${moduleLetter}/${workspace.workspaceKey}`
            : `/public/tenant/${workspace.workspaceKey}`;
          const href = tenantPlaneHref(path);

          return (
            <Link
              key={`${workspace.scope}-${workspace.moduleKey ?? 'tenant'}-${workspace.workspaceKey}`}
              href={href}
              className="group flex items-center gap-2 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]"
              data-testid={`link-public-${workspace.scope}-${workspace.workspaceKey}`}
            >
              {workspace.displayName}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </div>
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
        <Route
          path="/"
          component={
            import.meta.env.DEV && developmentPlane === 'design'
              ? DevelopmentDesignHome
              : Home
          }
        />
        <Route path="/login" component={Login} />
        <Route path="/change-password" component={ChangePassword} />
        <Route path="/platform-staff/login" component={PlatformStaffLogin} />
        <Route path="/platform-staff/change-password" component={PlatformStaffChangePassword} />
        <Route path="/platform-staff/home">
          <PlatformStaffHome />
        </Route>
        <Route path="/platform-staff/workspaces/:workspaceKey">
          {(params) => <PlatformStaffHome workspaceKey={params.workspaceKey} />}
        </Route>
        <Route path="/platform/home/dashboard" component={OwnerHome} />
        <Route path="/platform/home" component={OwnerHome} />
        <Route path="/tenant/home/dashboard">
          <LocalAdminHome />
        </Route>
        <Route path="/tenant/home">
          <LocalAdminHome />
        </Route>
        <Route path="/module/:moduleLetter/home/dashboard">
          {(params) => <LocalAdminHome moduleLetter={params.moduleLetter} />}
        </Route>
        <Route path="/module/:moduleLetter/home">
          {(params) => <LocalAdminHome moduleLetter={params.moduleLetter} />}
        </Route>
        <Route path="/admin">
          <AdminControlPlane />
        </Route>
        <Route path="/tenant-admin-staff/:workspaceKey" component={TenantAdminStaffWorkspaceRoute} />
        {!(import.meta.env.DEV && developmentPlane === 'design') ? (
          <Route path="/public/platform/:workspaceKey">
            {params => <PublicDestination scope="platform" workspaceKey={params.workspaceKey!} />}
          </Route>
        ) : null}
        <Route path="/public/tenant/:workspaceKey">
          {params => <PublicDestination scope="tenant" workspaceKey={params.workspaceKey!} />}
        </Route>
        <Route path="/public/module/:moduleLetter/:workspaceKey">
          {params => <PublicDestination scope="module" moduleLetter={params.moduleLetter!} workspaceKey={params.workspaceKey!} />}
        </Route>
        <Route path="/:moduleLetter/admin">
          {(params) =>
            isModuleLetter(params.moduleLetter ?? '') ? (
              <AdminControlPlane moduleLetter={params.moduleLetter!.toLowerCase()} />
            ) : (
              <InvalidRoute requested={`/${params.moduleLetter}/admin`} reason="Module letters run from a through h." />
            )
          }
        </Route>
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

export function PublicDestination({
  scope, moduleLetter, workspaceKey
}: {
  scope: 'platform' | 'tenant' | 'module',
  moduleLetter?: string,
  workspaceKey: string
}) {
  const isPlatform = scope === 'platform';
  const customerName = useCustomerName();

  const [platformData, setPlatformData] = useState<{workspaces: any[]} | null>(null);
  const [loading, setLoading] = useState(isPlatform);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isPlatform) {
      setLoading(true);
      fetch('/api/owner/public/workspaces')
        .then(res => res.json())
        .then(data => setPlatformData(data))
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [isPlatform]);

  const tenantData = useGetPublicTenantWorkspaces({
    query: {
      enabled: !isRootHostname(window.location.hostname) && !isPlatform,
      retry: false,
      queryKey: getGetPublicTenantWorkspacesQueryKey()
    }
  });

  const isLoading = isPlatform ? loading : tenantData.isLoading;
  const isError = isPlatform ? error : tenantData.isError;
  const data = isPlatform ? platformData : tenantData.data;

  if (isLoading) {
    return (
      <RouteFrame eyebrow="BisBy / public surface" title="Loading destination...">
        <LoadingState label="Public Data" />
      </RouteFrame>
    );
  }

  if (isError || !data) {
    return (
      <RouteFrame eyebrow="BisBy / public surface" title="Destination unavailable">
        <div className="mt-12 border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--card)/.72)] p-6 md:p-8">
          <div className="flex items-center gap-3 text-[hsl(var(--accent-foreground))]">
            <ShieldAlert className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-[0.15em]">
              Error loading public directory
            </span>
          </div>
        </div>
      </RouteFrame>
    );
  }

  const workspace = data.workspaces.find((ws: any) => {
    if (ws.workspaceKey !== workspaceKey) return false;
    if (ws.scope !== scope) return false;
    if (scope === 'module') {
      return ws.moduleKey === `module_${moduleLetter}`;
    }
    return true;
  });

  if (!workspace) {
    return (
      <RouteFrame eyebrow="BisBy / public surface" title="Not found">
        <div className="mt-12 border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--card)/.72)] p-6 md:p-8">
          <div className="flex items-center gap-3 text-[hsl(var(--accent-foreground))]">
            <CircleAlert className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-[0.15em]">
              Workspace not public or does not exist
            </span>
          </div>
        </div>
      </RouteFrame>
    );
  }

  return (
    <RouteFrame
      eyebrow={`BisBy / ${workspace.workspaceType.replace('_', ' ')}`}
      title={workspace.displayName}
    >
      <div className="mt-12">
        <div className="flex flex-col gap-4 border p-6 md:p-8 border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)]">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              {workspace.displayName}
            </span>
            {workspace.contactEnabled && (
              <StatusPill tone="good">Accepting inquiries</StatusPill>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            <span>{scope} plane</span>
            <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
            <span>{workspace.workspaceKey}</span>
            {scope === 'module' && moduleLetter && (
              <>
                <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
                <span>Module {moduleLetter.toUpperCase()}</span>
              </>
            )}
          </div>

          <div className="mt-8 border-t border-[hsl(var(--border))] pt-6 text-sm text-[hsl(var(--muted-foreground))] max-w-2xl">
            <p>
              This is a verified public surface for {isPlatform ? 'the platform' : customerName || 'this customer'}.
              {workspace.contactEnabled
                ? " The contact intake module is currently active."
                : " This workspace provides public information only."}
            </p>
          </div>

          <div className="mt-8">
            <Link href="/" className="inline-flex items-center gap-2 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]">
              Return to entry
            </Link>
          </div>
        </div>
      </div>
    </RouteFrame>
  );
}
