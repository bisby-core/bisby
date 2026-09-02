import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, X, Check, Trash2, Power } from 'lucide-react';
import { StatusPill } from '@/App';

export interface AssignableWorkspace {
  workspaceKey: string;
  displayName: string;
  isActive?: boolean;
}

export function WorkspaceAssignmentOptions({
  workspaces,
  selectedKeys,
  setSelectedKeys,
  disabled = false,
  testIdPrefix,
}: {
  workspaces: AssignableWorkspace[];
  selectedKeys: string[];
  setSelectedKeys: (keys: string[]) => void;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const availableWorkspaces = workspaces.filter((workspace) => workspace.isActive !== false);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {availableWorkspaces.map((workspace) => {
        const checked = selectedKeys.includes(workspace.workspaceKey);
        return (
          <label
            key={workspace.workspaceKey}
            className={`flex items-center gap-3 border px-3 py-3 transition-colors ${
              checked
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.05)]'
                : 'border-[hsl(var(--border))]'
            } ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-[hsl(var(--card)/.5)]'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(event) =>
                setSelectedKeys(
                  event.target.checked
                    ? [...selectedKeys, workspace.workspaceKey]
                    : selectedKeys.filter((key) => key !== workspace.workspaceKey),
                )
              }
              className="h-3 w-3 accent-[hsl(var(--primary))]"
              data-testid={`${testIdPrefix}-${workspace.workspaceKey}`}
            />
            <span className="min-w-0">
              <span className="block font-mono text-xs uppercase text-[hsl(var(--foreground))]">
                {workspace.workspaceKey}
              </span>
              <span className="block truncate text-[10px] text-[hsl(var(--muted-foreground))]" title={workspace.displayName}>
                {workspace.displayName}
              </span>
            </span>
          </label>
        );
      })}
      {availableWorkspaces.length === 0 && (
        <div className="col-span-full border border-[hsl(var(--border))] bg-[hsl(var(--background)/.5)] p-3 text-sm text-[hsl(var(--muted-foreground))]">
          No active workspaces available.
        </div>
      )}
    </div>
  );
}

export function StaffWorkspaceCard({
  mode,
  roleLabel,
  workspaces,
  
  onClose,
  onCreate,
  
  defaultUsername = '',
  defaultDisplayName = '',
  defaultWorkspaceKeys = [],
  isActive = true,
  
  onSave,
  onSuspend,
  onReactivate,
  onDelete,
  
  readOnly = false,
  pending = false,
  error = false,
  testIdPrefix,
}: {
  mode: 'create' | 'edit';
  roleLabel: string; // e.g. "module staff", "tenant admin staff"
  workspaces: AssignableWorkspace[];
  
  onClose?: () => void;
  onCreate?: (data: { username: string; displayName: string; temporaryPassword: string; workspaceKeys: string[] }) => Promise<void>;
  
  defaultUsername?: string;
  defaultDisplayName?: string;
  defaultWorkspaceKeys?: string[];
  isActive?: boolean;
  
  onSave?: (workspaceKeys: string[]) => Promise<void>;
  onSuspend?: () => Promise<void>;
  onReactivate?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  
  readOnly?: boolean;
  pending?: boolean;
  error?: boolean;
  testIdPrefix: string;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [workspaceKeys, setWorkspaceKeys] = useState(defaultWorkspaceKeys);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (mode === 'edit') {
      setWorkspaceKeys(defaultWorkspaceKeys);
    }
  }, [defaultWorkspaceKeys, mode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'create' && onCreate) {
      await onCreate({ username, displayName, temporaryPassword, workspaceKeys });
    } else if (mode === 'edit' && onSave) {
      await onSave(workspaceKeys);
    }
  };

  const isFormValid = mode === 'create' 
    ? username.trim() && displayName.trim() && temporaryPassword.length >= 8
    : workspaceKeys.length > 0;

  return (
    <form 
      onSubmit={handleSubmit}
      className={`border p-6 transition-colors ${
        mode === 'edit' && !isActive
          ? 'border-[hsl(var(--border)/.5)] bg-[hsl(var(--card)/.3)] opacity-75'
          : 'border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)]'
      }`}
      data-testid={mode === 'edit' ? `${testIdPrefix}-${defaultUsername}` : `${testIdPrefix}-new`}
    >
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center bg-[hsl(var(--border)/.5)] text-[hsl(var(--foreground))]">
            <UserPlus className="h-4 w-4" />
          </div>
          <h3 className="font-mono text-sm uppercase tracking-[0.15em] text-[hsl(var(--foreground))]">
            {mode === 'create' ? `NEW ${roleLabel}` : roleLabel}
          </h3>
          {mode === 'edit' && (
            <StatusPill tone={isActive ? 'good' : 'neutral'}>
              {isActive ? 'active' : 'suspended'}
            </StatusPill>
          )}
          {readOnly && <StatusPill tone="neutral">read only</StatusPill>}
        </div>
        {mode === 'create' && onClose && (
          <button type="button" onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-2">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-8 grid gap-8">
        <div className="grid gap-6 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Username</span>
            {mode === 'create' ? (
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-[hsl(var(--border))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
                data-testid={`${testIdPrefix}-input-username`}
              />
            ) : (
              <div className="w-full border border-transparent px-3 py-3 font-mono text-sm text-[hsl(var(--foreground))]">
                {defaultUsername}
              </div>
            )}
          </label>
          <label className="block">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Display Name</span>
            {mode === 'create' ? (
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-[hsl(var(--border))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
                data-testid={`${testIdPrefix}-input-display-name`}
              />
            ) : (
              <div className="w-full border border-transparent px-3 py-3 font-mono text-sm text-[hsl(var(--foreground))]">
                {defaultDisplayName}
              </div>
            )}
          </label>
        </div>

        {mode === 'create' && (
          <div className="grid gap-6 md:grid-cols-2">
             <div className="hidden md:block"></div>
             <label className="block">
               <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Temporary Password</span>
               <input
                 required
                 minLength={8}
                 type="password"
                 value={temporaryPassword}
                 onChange={(e) => setTemporaryPassword(e.target.value)}
                 className="w-full border border-[hsl(var(--border))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
                 data-testid={`${testIdPrefix}-input-password`}
               />
             </label>
          </div>
        )}

        <div>
          <span className="mb-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            Workspace Assignment (select at least one)
          </span>
          <WorkspaceAssignmentOptions
            workspaces={workspaces}
            selectedKeys={workspaceKeys}
            setSelectedKeys={setWorkspaceKeys}
            disabled={readOnly || pending}
            testIdPrefix={`${testIdPrefix}-checkbox-${mode === 'create' ? 'new' : defaultUsername}`}
          />
        </div>
      </div>

      {!readOnly && (
        <div className="mt-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {mode === 'edit' && (
              <>
                {deleteConfirm ? (
                  <div className="flex items-center gap-2 border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.1)] px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--destructive))]">Confirm delete?</span>
                    <button type="button" onClick={() => setDeleteConfirm(false)} className="px-2 font-mono text-[10px] uppercase hover:underline">Cancel</button>
                    <button type="button" onClick={() => { setDeleteConfirm(false); onDelete?.(); }} className="px-2 font-mono text-[10px] uppercase font-bold text-[hsl(var(--destructive))] hover:underline" data-testid={`${testIdPrefix}-delete-confirm-${defaultUsername}`}>Delete</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    disabled={pending}
                    className="flex items-center gap-2 border border-[hsl(var(--border))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] disabled:opacity-50"
                    data-testid={`${testIdPrefix}-delete-${defaultUsername}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={isActive ? onSuspend : onReactivate}
                  disabled={pending}
                  className="flex items-center gap-2 border border-[hsl(var(--border))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
                  data-testid={`${testIdPrefix}-suspend-${defaultUsername}`}
                >
                  <Power className="h-3.5 w-3.5" /> {isActive ? 'Suspend' : 'Reactivate'}
                </button>
              </>
            )}
            {error && (
              <p className="text-sm text-[hsl(var(--accent-foreground))] ml-4">
                Could not complete operation.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending || !isFormValid}
            className="bg-[hsl(var(--primary))] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:opacity-50 inline-flex items-center gap-2"
            data-testid={`${testIdPrefix}-submit`}
          >
            {mode === 'create' ? (
              <>
                <Check className="h-3.5 w-3.5" />
                {pending ? 'Creating...' : 'Create Account'}
              </>
            ) : (
              <>
                {pending ? 'Saving...' : 'Save Assignment'}
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}
