import { useState, type FormEvent } from 'react';
import {
  type WorkspaceContentNode,
  WorkspaceAccessLevel,
  WorkspaceType,
  WorkspaceMetadataRequest,
} from '@workspace/api-client-react';
import { Plus, X, Trash2, Check, Settings2, ShieldAlert, Activity, AlertTriangle, Pencil } from 'lucide-react';
import { StatusPill } from '@/App';

export type UnifiedWorkspace = {
  id?: string;
  workspaceKey: string;
  displayName: string;
  workspaceType: WorkspaceType;
  isActive: boolean;
  publicVisible: boolean;
  contactEnabled: boolean;
  contentNodes: WorkspaceContentNode[];
  createdAt?: string;
};

export interface WorkspaceControlUIProps {
  title: string;
  description: string;
  workspaces: UnifiedWorkspace[];
  isLoading: boolean;
  isError: boolean;
  
  createPending: boolean;
  createError: boolean;
  onCreate: (data: WorkspaceMetadataRequest) => Promise<void>;
  
  updateMetadataPending: boolean;
  updateMetadataError: boolean;
  onUpdateMetadata: (workspaceKey: string, data: WorkspaceMetadataRequest) => Promise<void>;
  
  updateAccessPending: boolean;
  updateAccessError: boolean;
  onUpdateAccess?: (workspaceKey: string, controls: {nodeId: string, accessLevel: WorkspaceAccessLevel}[]) => Promise<void>;
  
  removePending: boolean;
  removeError: boolean;
  onRemove: (workspaceKey: string) => Promise<void>;
}

export function WorkspaceControlUI({
  title, description, workspaces, isLoading, isError,
  createPending, createError, onCreate,
  updateMetadataPending, updateMetadataError, onUpdateMetadata,
  updateAccessPending, updateAccessError, onUpdateAccess,
  removePending, removeError, onRemove
}: WorkspaceControlUIProps) {
  const [isCreating, setIsCreating] = useState(false);

  if (isLoading) {
    return (
      <div className="mt-12 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.74)] p-6 md:p-8">
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4 animate-pulse text-[hsl(var(--secondary-foreground))]" />
          <span className="font-mono text-xs uppercase tracking-[0.15em]">Loading workspaces</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-12 border border-[hsl(var(--accent)/.52)] bg-[hsl(var(--card)/.72)] p-6 md:p-8">
        <div className="flex items-center gap-3 text-[hsl(var(--accent-foreground))]">
          <ShieldAlert className="h-5 w-5" />
          <span className="font-mono text-xs uppercase tracking-[0.15em]">
            Error loading workspace control
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 border-b border-[hsl(var(--border))] pb-6 md:flex-row md:items-center">
        <div>
          <h3 className="font-mono text-sm uppercase tracking-[0.15em] text-[hsl(var(--foreground))]">{title}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        </div>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85"
            data-testid="button-create-workspace-start"
          >
            <Plus className="h-3.5 w-3.5" /> Add Workspace
          </button>
        )}
      </div>

      {isCreating && (
        <div className="mt-8 border border-[hsl(var(--primary))] bg-[hsl(var(--card)/.76)] p-6 shadow-sm md:p-8">
          <WorkspaceMetadataForm 
            mode="create"
            isPending={createPending}
            isError={createError}
            onSubmit={async (data) => {
              await onCreate(data);
              setIsCreating(false);
            }} 
            onCancel={() => setIsCreating(false)} 
          />
        </div>
      )}

      <div className="mt-8 grid gap-4">
        {workspaces.map((workspace) => (
          <WorkspaceCard 
            key={workspace.workspaceKey} 
            workspace={workspace} 
            updateMetadataPending={updateMetadataPending}
            updateMetadataError={updateMetadataError}
            onUpdateMetadata={onUpdateMetadata}
            updateAccessPending={updateAccessPending}
            updateAccessError={updateAccessError}
            onUpdateAccess={onUpdateAccess}
            removePending={removePending}
            removeError={removeError}
            onRemove={onRemove}
          />
        ))}
        {workspaces.length === 0 && !isCreating && (
          <div className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.4)] p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">
              No workspaces provisioned yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceCard({ 
  workspace, 
  updateMetadataPending, updateMetadataError, onUpdateMetadata,
  updateAccessPending, updateAccessError, onUpdateAccess,
  removePending, removeError, onRemove 
}: { 
  workspace: UnifiedWorkspace;
  updateMetadataPending: boolean;
  updateMetadataError: boolean;
  onUpdateMetadata: (workspaceKey: string, data: WorkspaceMetadataRequest) => Promise<void>;
  updateAccessPending: boolean;
  updateAccessError: boolean;
  onUpdateAccess?: (workspaceKey: string, controls: {nodeId: string, accessLevel: WorkspaceAccessLevel}[]) => Promise<void>;
  removePending: boolean;
  removeError: boolean;
  onRemove: (workspaceKey: string) => Promise<void>;
}) {
  const [activeForm, setActiveForm] = useState<'metadata' | 'access' | 'delete' | null>(null);

  return (
    <div
      className={`flex flex-col gap-4 border p-5 transition-colors md:p-6 ${
        workspace.isActive
          ? 'border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)]'
          : 'border-[hsl(var(--border)/.5)] bg-[hsl(var(--card)/.3)] opacity-75'
      }`}
      data-testid={`card-workspace-${workspace.workspaceKey}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">
              {workspace.displayName}
            </span>
            <StatusPill tone={workspace.isActive ? 'good' : 'neutral'}>
              {workspace.isActive ? 'active' : 'inactive'}
            </StatusPill>
            {workspace.workspaceType !== 'normal' && (
              <StatusPill tone="neutral">
                {workspace.workspaceType.replace('_', ' ')}
              </StatusPill>
            )}
            {workspace.publicVisible && (
              <StatusPill tone="good">Public</StatusPill>
            )}
            {workspace.contactEnabled && (
              <StatusPill tone="good">Contact</StatusPill>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            <span className="text-[hsl(var(--foreground))]">
              {workspace.workspaceKey}
            </span>
            {workspace.createdAt && (
              <>
                <span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" />
                <span>Created {new Date(workspace.createdAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'metadata' ? null : 'metadata')}
            className={`border px-3 py-2 transition-colors ${
              activeForm === 'metadata'
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--foreground))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
            }`}
            title="Edit Metadata"
            data-testid={`button-edit-workspace-metadata-${workspace.workspaceKey}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          
          {onUpdateAccess && (
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === 'access' ? null : 'access')}
              className={`border px-3 py-2 transition-colors ${
                activeForm === 'access'
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--foreground))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))]'
              }`}
              title="Edit Access Controls"
              data-testid={`button-edit-workspace-access-${workspace.workspaceKey}`}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'delete' ? null : 'delete')}
            className={`border px-3 py-2 transition-colors ${
              activeForm === 'delete'
                ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent-foreground))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]'
            }`}
            title="Remove Workspace"
            data-testid={`button-remove-workspace-${workspace.workspaceKey}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {activeForm === 'metadata' && (
        <WorkspaceMetadataForm 
          mode="edit"
          initialData={workspace}
          isPending={updateMetadataPending}
          isError={updateMetadataError}
          onSubmit={async (data) => {
            await onUpdateMetadata(workspace.workspaceKey, data);
            setActiveForm(null);
          }}
          onCancel={() => setActiveForm(null)}
        />
      )}
      {activeForm === 'access' && onUpdateAccess && (
        <EditAccessForm 
          workspace={workspace} 
          isPending={updateAccessPending}
          isError={updateAccessError}
          onSubmit={async (controls) => {
            await onUpdateAccess(workspace.workspaceKey, controls);
            setActiveForm(null);
          }}
          onCancel={() => setActiveForm(null)} 
        />
      )}
      {activeForm === 'delete' && (
        <DeleteWorkspaceForm 
          workspace={workspace} 
          isPending={removePending}
          isError={removeError}
          onSubmit={async () => {
            await onRemove(workspace.workspaceKey);
            setActiveForm(null);
          }}
          onCancel={() => setActiveForm(null)} 
        />
      )}
    </div>
  );
}

function WorkspaceMetadataForm({ 
  mode, initialData, isPending, isError, onSubmit, onCancel 
}: { 
  mode: 'create' | 'edit';
  initialData?: UnifiedWorkspace;
  isPending: boolean;
  isError: boolean;
  onSubmit: (data: WorkspaceMetadataRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(initialData?.displayName ?? '');
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(initialData?.workspaceType ?? 'normal');
  const [publicVisible, setPublicVisible] = useState(initialData?.publicVisible ?? false);
  const [contactEnabled, setContactEnabled] = useState(initialData?.contactEnabled ?? false);

  // Enforce restrictions automatically
  const effectivePublicVisible = workspaceType === 'normal' ? false : publicVisible;
  const effectiveContactEnabled = workspaceType !== 'contact_us' ? false : contactEnabled;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      displayName,
      isActive,
      workspaceType,
      publicVisible: effectivePublicVisible,
      contactEnabled: effectiveContactEnabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={mode === 'edit' ? "mt-4 border-t border-[hsl(var(--border))] pt-4" : "flex flex-col gap-6"}>
      {mode === 'create' ? (
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
          <div className="flex items-center gap-3 text-[hsl(var(--foreground))]">
            <div className="flex h-8 w-8 items-center justify-center bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">
              <Plus className="h-4 w-4" />
            </div>
            <h3 className="font-mono text-sm uppercase tracking-[0.15em]">
              New Workspace
            </h3>
          </div>
          <button type="button" onClick={onCancel} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--foreground))]">
            Edit Metadata
          </h4>
          <button type="button" onClick={onCancel} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Display Name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
            data-testid="input-workspace-display-name"
            placeholder="e.g. Regional Office"
          />
        </label>
        
        <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Workspace Type
          <select
            value={workspaceType}
            onChange={(e) => {
              const type = e.target.value as WorkspaceType;
              setWorkspaceType(type);
              if (type === 'normal') {
                setPublicVisible(false);
                setContactEnabled(false);
              } else if (type === 'public_information') {
                setContactEnabled(false);
              }
            }}
            className="mt-2 w-full border border-[hsl(var(--input))] bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-[hsl(var(--ring))]"
            data-testid="select-workspace-type"
          >
            <option value="normal">Normal</option>
            <option value="public_information">Public Information</option>
            <option value="contact_us">Contact Us</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            data-testid="checkbox-workspace-active"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--foreground))]">Active</span>
        </label>
        
        <label className={`flex items-center gap-3 ${workspaceType === 'normal' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={effectivePublicVisible}
            onChange={(e) => setPublicVisible(e.target.checked)}
            disabled={workspaceType === 'normal'}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            data-testid="checkbox-workspace-public"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--foreground))]">Public Visible</span>
        </label>
        
        <label className={`flex items-center gap-3 ${workspaceType !== 'contact_us' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={effectiveContactEnabled}
            onChange={(e) => setContactEnabled(e.target.checked)}
            disabled={workspaceType !== 'contact_us'}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            data-testid="checkbox-workspace-contact"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--foreground))]">Contact Enabled</span>
        </label>
      </div>

      {isError && (
        <p className="border-l-2 border-[hsl(var(--accent))] pl-3 text-sm leading-6 text-[hsl(var(--accent-foreground))]">
          {mode === 'create' ? 'Could not create workspace.' : 'Could not update workspace metadata.'}
        </p>
      )}

      <div className="flex justify-end border-t border-[hsl(var(--border))] pt-6 mt-4">
        <button
          type="submit"
          disabled={isPending || !displayName}
          className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
          data-testid="button-submit-workspace-metadata"
        >
          <Check className="h-3.5 w-3.5" />
          {isPending ? 'Saving...' : mode === 'create' ? 'Create Workspace' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function EditAccessForm({ 
  workspace, isPending, isError, onSubmit, onCancel 
}: { 
  workspace: UnifiedWorkspace;
  isPending: boolean;
  isError: boolean;
  onSubmit: (controls: {nodeId: string, accessLevel: WorkspaceAccessLevel}[]) => Promise<void>;
  onCancel: () => void; 
}) {
  const [accessLevels, setAccessLevels] = useState<Record<string, WorkspaceAccessLevel>>(() => {
    const acc: Record<string, WorkspaceAccessLevel> = {};
    workspace.contentNodes.forEach(n => { acc[n.id] = n.accessLevel; });
    return acc;
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(
      Object.entries(accessLevels).map(([nodeId, accessLevel]) => ({ nodeId, accessLevel }))
    );
  };

  const nodesByParent: Record<string, WorkspaceContentNode[]> = {};
  workspace.contentNodes.forEach(node => {
    const parentId = node.parentId || 'root';
    if (!nodesByParent[parentId]) nodesByParent[parentId] = [];
    nodesByParent[parentId].push(node);
  });

  Object.values(nodesByParent).forEach(list => list.sort((a,b) => a.sortOrder - b.sortOrder));

  const renderNodes = (parentId: string, depth: number) => {
    const children = nodesByParent[parentId] || [];
    if (children.length === 0) return null;

    return (
      <div className={`flex flex-col gap-2 ${depth > 0 ? 'ml-6 md:ml-8 border-l border-[hsl(var(--border))] pl-4 md:pl-6 mt-2' : ''}`}>
        {children.map(node => (
          <div key={node.id} className="flex flex-col gap-2">
            <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[hsl(var(--border))] bg-[hsl(var(--card)/.5)] p-3 md:px-4 hover:border-[hsl(var(--primary)/.3)] transition-colors ${depth === 0 ? 'shadow-sm' : ''}`}>
              <div className="flex items-center gap-3">
                <span className={`flex items-center justify-center shrink-0 h-7 w-7 border ${node.type === 'page' ? 'border-[hsl(var(--primary)/.4)] text-[hsl(var(--primary))] bg-[hsl(var(--primary)/.05)]' : node.type === 'tab' ? 'border-[hsl(var(--secondary)/.4)] text-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'} text-[10px] uppercase font-mono`}>
                  {node.type[0]}
                </span>
                <div>
                  <div className="font-medium text-sm text-[hsl(var(--foreground))]">{node.displayName}</div>
                  <div className="font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))] tracking-[0.05em]">{node.key}</div>
                </div>
              </div>
              <select
                value={accessLevels[node.id]}
                onChange={e => setAccessLevels(prev => ({...prev, [node.id]: e.target.value as WorkspaceAccessLevel}))}
                className={`w-full md:w-auto border bg-[hsl(var(--background))] px-3 py-2 font-mono text-[10px] uppercase outline-none transition-colors focus:border-[hsl(var(--ring))] ${
                  accessLevels[node.id] === 'active' 
                    ? 'border-[hsl(var(--primary)/.5)] text-[hsl(var(--foreground))]' 
                    : accessLevels[node.id] === 'not_available'
                      ? 'border-[hsl(var(--accent)/.4)] text-[hsl(var(--muted-foreground))] opacity-75'
                      : 'border-[hsl(var(--input))] text-[hsl(var(--foreground))]'
                }`}
                data-testid={`select-access-${workspace.workspaceKey}-${node.id}`}
              >
                <option value="active">Active</option>
                <option value="sign_only">Sign Only</option>
                <option value="view_only">View Only</option>
                <option value="not_available">Not Available</option>
              </select>
            </div>
            {renderNodes(node.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-[hsl(var(--border))] pt-4">
      <div className="mb-6 flex items-center justify-between">
        <h4 className="font-mono text-xs uppercase tracking-[0.15em] text-[hsl(var(--foreground))]">
          Configure Workspace Access
        </h4>
        <button type="button" onClick={onCancel} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6">
        {workspace.contentNodes.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No content nodes registered for this workspace.</p>
        ) : (
          renderNodes('root', 0)
        )}
      </div>

      {isError && (
        <p className="mb-4 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm text-[hsl(var(--accent-foreground))]">
          Could not update workspace access.
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
        <button
          type="submit"
          disabled={isPending || workspace.contentNodes.length === 0}
          className="bg-[hsl(var(--primary))] px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
          data-testid={`button-submit-access-${workspace.workspaceKey}`}
        >
          {isPending ? 'Saving...' : 'Save Access Levels'}
        </button>
      </div>
    </form>
  );
}

function DeleteWorkspaceForm({ 
  workspace, isPending, isError, onSubmit, onCancel 
}: { 
  workspace: UnifiedWorkspace;
  isPending: boolean;
  isError: boolean;
  onSubmit: () => Promise<void>;
  onCancel: () => void; 
}) {
  const [confirmKey, setConfirmKey] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (confirmKey !== workspace.workspaceKey) return;
    await onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-[hsl(var(--border))] pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[hsl(var(--accent))]">
          <AlertTriangle className="h-4 w-4" />
          <h4 className="font-mono text-xs uppercase tracking-[0.15em]">
            Remove Workspace
          </h4>
        </div>
        <button type="button" onClick={onCancel} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6 p-4 border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--accent)/.05)]">
        <p className="text-sm text-[hsl(var(--accent-foreground))]">
          This action permanently removes the workspace <strong className="font-semibold">{workspace.displayName}</strong>.
          All Staff and Client assignments to this workspace will be removed.
        </p>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Type <span className="font-mono bg-[hsl(var(--background))] px-1 border border-[hsl(var(--border))]">{workspace.workspaceKey}</span> to confirm.
        </p>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1">
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
            Confirmation
            <input
              value={confirmKey}
              onChange={(e) => setConfirmKey(e.target.value)}
              required
              className="mt-2 w-full border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-sm outline-none focus:border-[hsl(var(--accent))]"
              data-testid={`input-confirm-delete-${workspace.workspaceKey}`}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending || confirmKey !== workspace.workspaceKey}
          className="h-[38px] bg-[hsl(var(--accent))] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--accent-foreground))] hover:opacity-85 disabled:opacity-50"
          data-testid={`button-submit-delete-${workspace.workspaceKey}`}
        >
          {isPending ? 'Removing...' : 'Permanently Remove'}
        </button>
      </div>

      {isError && (
        <p className="mt-3 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm text-[hsl(var(--accent-foreground))]">
          Could not remove workspace.
        </p>
      )}
    </form>
  );
}
