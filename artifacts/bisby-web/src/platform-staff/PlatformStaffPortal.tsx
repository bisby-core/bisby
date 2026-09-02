import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, ArrowRight, LogOut } from 'lucide-react';
import {
  changePlatformStaffPassword,
  getCurrentPlatformStaff,
  getPlatformStaffWorkspace,
  getPlatformStaffWorkspaces,
  loginPlatformStaff,
  logoutPlatformStaff,
} from '@workspace/api-client-react';

interface PlatformStaffSession {
  authenticated: true;
  username: string;
  displayName: string;
  requiresPasswordChange: boolean;
}

interface PlatformStaffWorkspace {
  workspaceKey: string;
  displayName: string;
}

const rootApiOptions = { baseUrl: null } as const;

function BrandMark() {
  return <Link href="/platform-staff/home" className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><span className="font-mono text-sm font-medium">B/</span></span><span className="font-mono text-sm font-medium tracking-[0.18em] text-[hsl(var(--sidebar-foreground))]">BISBY</span></Link>;
}

function RouteFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="bisby-grid min-h-[100dvh] px-5 py-8 md:px-10 md:py-12"><div className="mx-auto w-full max-w-[1120px]"><div className="bisby-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]"><span className="h-1.5 w-1.5 bg-[hsl(var(--accent))]" />{eyebrow}</div><h1 className="bisby-reveal mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{title}</h1>{children}</div></div>;
}

export function PlatformStaffLogin() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const session = await loginPlatformStaff({ username, password }, rootApiOptions);
      setLocation(session.requiresPasswordChange ? '/platform-staff/change-password' : '/platform-staff/home');
    } catch {
      setError('The platform staff credentials were not accepted.');
    }
  };

  return (
    <RouteFrame eyebrow="BisBy / platform staff" title="Platform Staff Sign In">
      <form onSubmit={(event) => void submit(event)} className="mt-12 max-w-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.72)] p-6 md:p-8">
        <div className="grid gap-5">
          <label className="font-mono text-[10px] uppercase tracking-[0.14em]">Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full border bg-transparent px-3 py-3 text-sm" /></label>
          <label className="font-mono text-[10px] uppercase tracking-[0.14em]">Password<input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full border bg-transparent px-3 py-3 text-sm" /></label>
        </div>
        {error && <p className="mt-4 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm">{error}</p>}
        <button className="mt-6 bg-[hsl(var(--primary))] px-5 py-3 font-mono text-[10px] uppercase text-[hsl(var(--primary-foreground))]">Sign In</button>
      </form>
    </RouteFrame>
  );
}

export function PlatformStaffChangePassword() {
  const [, setLocation] = useLocation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await changePlatformStaffPassword({ currentPassword, newPassword }, rootApiOptions);
      setLocation('/platform-staff/home');
    } catch {
      setError('The password could not be changed.');
    }
  };
  return (
    <RouteFrame eyebrow="BisBy / platform staff" title="Change Password">
      <form onSubmit={(event) => void submit(event)} className="mt-12 max-w-xl border border-[hsl(var(--border))] p-6 md:p-8">
        <label className="block font-mono text-[10px] uppercase">Current Password<input required autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 w-full border bg-transparent px-3 py-3" /></label>
        <label className="mt-5 block font-mono text-[10px] uppercase">New Password<input required autoComplete="new-password" minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full border bg-transparent px-3 py-3" /></label>
        {error && <p className="mt-4 text-sm text-[hsl(var(--accent-foreground))]">{error}</p>}
        <button className="mt-6 bg-[hsl(var(--primary))] px-5 py-3 font-mono text-[10px] uppercase text-[hsl(var(--primary-foreground))]">Change Password</button>
      </form>
    </RouteFrame>
  );
}

export function PlatformStaffHome({ workspaceKey }: { workspaceKey?: string }) {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<PlatformStaffSession | null>(null);
  const [workspaces, setWorkspaces] = useState<PlatformStaffWorkspace[]>([]);
  const [workspace, setWorkspace] = useState<PlatformStaffWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCurrentPlatformStaff(rootApiOptions),
      getPlatformStaffWorkspaces(rootApiOptions),
      workspaceKey ? getPlatformStaffWorkspace(workspaceKey, rootApiOptions) : Promise.resolve(null),
    ]).then(([nextSession, nextWorkspaces, nextWorkspace]) => {
      if (nextSession.requiresPasswordChange) {
        setLocation('/platform-staff/change-password');
        return;
      }
      setSession(nextSession);
      setWorkspaces(nextWorkspaces.workspaces);
      setWorkspace(nextWorkspace);
    }).catch(() => setLocation('/platform-staff/login')).finally(() => setLoading(false));
  }, [setLocation, workspaceKey]);

  if (loading || !session) return <RouteFrame eyebrow="BisBy / platform staff" title="Platform Staff"><div className="mt-10 flex items-center gap-3"><Activity className="h-4 w-4 animate-pulse" /> Checking access</div></RouteFrame>;

  return (
    <div className="bisby-noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] md:grid md:grid-cols-[260px_1fr]">
      <aside className="border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] p-6 md:min-h-[100dvh] md:border-b-0 md:border-r">
        <BrandMark />
        <p className="mt-10 text-lg font-semibold text-[hsl(var(--sidebar-foreground))]">{session.displayName}</p>
        <nav className="mt-8 grid gap-2" aria-label="Platform Staff Workspaces">
          <Link href="/platform-staff/home" className="border-l-2 border-[hsl(var(--sidebar-primary))] px-3 py-3 font-mono text-xs uppercase">Home</Link>
          {workspaces.map((item) => <Link key={item.workspaceKey} href={`/platform-staff/workspaces/${item.workspaceKey}`} className="flex items-center justify-between border-l-2 border-transparent px-3 py-3 font-mono text-xs uppercase text-[hsl(var(--sidebar-foreground))]">{item.displayName}<ArrowRight className="h-3.5 w-3.5" /></Link>)}
        </nav>
        <button type="button" onClick={async () => { await logoutPlatformStaff(rootApiOptions); setLocation('/platform-staff/login'); }} className="mt-10 inline-flex items-center gap-2 font-mono text-[10px] uppercase"><LogOut className="h-3.5 w-3.5" /> Sign Out</button>
      </aside>
      <main className="bisby-grid min-h-[100dvh] px-6 py-12 md:px-12">
        <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{workspace ? workspace.displayName : 'Platform Staff Home'}</h1>
      </main>
    </div>
  );
}