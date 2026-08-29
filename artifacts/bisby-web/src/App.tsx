import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  Radio,
  RotateCcw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import {
  getGetRouteAccessQueryKey,
  ModuleKey,
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

function Home() {
  const health = useHealthCheck();
  const healthStatus = health.isLoading ? 'checking' : health.isError ? 'unavailable' : 'reachable';
  return (
    <RouteFrame eyebrow="BisBy / entry point" title="A precise way in.">
      <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="bisby-reveal border border-[hsl(var(--border))] bg-[hsl(var(--card)/.76)] p-6 [animation-delay:160ms] md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Tenant URL format</p>
              <p className="mt-5 break-all font-mono text-lg leading-relaxed text-[hsl(var(--foreground))] md:text-2xl">
                <span className="text-[hsl(var(--accent))]">{'{tenant}'}</span>
                <span className="text-[hsl(var(--muted-foreground))]">.bisby.com/</span>
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
                <p className="font-mono text-xs uppercase tracking-[0.15em]">Destination pending</p>
                <p className="mt-1 text-sm text-[hsl(var(--primary-foreground)/.62)]">Awaiting a tenant path.</p>
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
        <div className="font-mono text-[10px] leading-5 text-[hsl(var(--muted-foreground))] md:text-right">
           <span className="text-[hsl(var(--foreground))]">{subdomain}.bisby.com</span>
          <br />
          tenant {tenantId}
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
        <Route path="/" component={Home} />
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
