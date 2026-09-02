import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type WorkspaceAccessLevel,
  type WorkspaceContentNodeType,
  type WorkspaceHierarchyNodeInput,
  type WorkspaceHierarchyNodeUpdate,
  type WorkspaceMetadataRequest,
  useAddTenantAdminStaffWorkspaceHierarchyNode,
  getGetTenantAdminStaffAdministrationQueryKey,
  useCreateTenantAdminStaff,
  useCreateTenantAdminStaffWorkspace,
  useGetTenantAdminStaffAdministration,
  useRemoveTenantAdminStaffWorkspaceHierarchyNode,
  useRemoveTenantAdminStaffWorkspace,
  useResetTenantAdminStaffPassword,
  useUpdateTenantAdminStaffAssignments,
  useUpdateTenantAdminStaffWorkspaceAccess,
  useUpdateTenantAdminStaffWorkspaceHierarchyNode,
  useUpdateTenantAdminStaffStatus,
  useUpdateTenantAdminStaffWorkspace,
  useDeleteTenantAdminStaff,
  type TenantAdminStaffAccount,
  type TenantAdminStaffAdministrationSnapshot,
  type TenantAdminStaffWorkspace,
} from '@workspace/api-client-react';
import { Key, Pencil, Power, UserPlus } from 'lucide-react';
import { LoadingState, StatusPill } from '@/App';
import { WorkspaceControlUI, type UnifiedWorkspace } from './WorkspaceControlUI';
import { StaffWorkspaceCard } from './StaffWorkspaceAssignment';

type Staff = TenantAdminStaffAccount;
type Workspace = TenantAdminStaffWorkspace;
const refresh = (client: ReturnType<typeof useQueryClient>) => client.invalidateQueries({ queryKey: getGetTenantAdminStaffAdministrationQueryKey() });

export function TenantAdminStaffControl({ section, customerName }: { section: 'staff' | 'assignments' | 'workspaces'; customerName: string }) {
  const snapshot = useGetTenantAdminStaffAdministration();
  const data: TenantAdminStaffAdministrationSnapshot | undefined = snapshot.data;
  if (snapshot.isLoading) return <LoadingState label="Admin Staff administration" />;
  if (snapshot.isError || !data) return <p className="border border-[hsl(var(--accent)/.52)] p-6 text-sm">Could not load Admin Staff administration.</p>;
  if (section === 'staff') return <StaffSection staff={data.staff} workspaces={data.workspaces} customerName={customerName} />;
  if (section === 'assignments') return <StaffAssignmentSection staff={data.staff} workspaces={data.workspaces} customerName={customerName} />;
  return <WorkspaceSection workspaces={data.workspaces} customerName={customerName} />;
}

function StaffSection({ staff, workspaces, customerName }: { staff: Staff[]; workspaces: Workspace[]; customerName: string }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-6">
        <div>
          <h3 className="font-mono text-sm uppercase tracking-[.15em]">{customerName} Admin Staff</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Manage {customerName} Admin Staff accounts.</p>
        </div>
      </div>
      <div className="mt-8 grid gap-4">
        {staff.map((member) => <StaffCard key={member.id} staff={member} />)}
        {!staff.length && <p className="border border-[hsl(var(--border))] p-8 text-center font-mono text-xs uppercase text-[hsl(var(--muted-foreground))]">No {customerName} Admin Staff accounts</p>}
      </div>
    </div>
  );
}

function StaffCard({ staff }: { staff: Staff }) {
  const client = useQueryClient();
  const reset = useResetTenantAdminStaffPassword();
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <div className="border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] p-5" data-testid={`card-tenant-admin-staff-${staff.username}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <b>{staff.displayName}</b>
          <div className="mt-2 font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{staff.username} · Tenant Admin Staff</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={staff.isActive ? 'good' : 'neutral'}>{staff.isActive ? 'active' : 'inactive'}</StatusPill>
          <button type="button" onClick={() => setResetting(!resetting)} disabled={!staff.isActive} className="border p-2" data-testid={`button-reset-tenant-admin-staff-${staff.username}`}><Key className="h-4 w-4" /></button>
        </div>
      </div>
      {resetting && (
        <form onSubmit={async (e) => { e.preventDefault(); await reset.mutateAsync({ accountId: staff.id, data: { temporaryPassword: password } }); await refresh(client); setResetting(false); }} className="mt-4 flex gap-2 border-t pt-4">
          <input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border bg-transparent px-3 py-2" placeholder="Temporary password" data-testid={`input-reset-tenant-admin-staff-${staff.username}`} />
          <button className="bg-[hsl(var(--primary))] px-4 font-mono text-[10px] uppercase text-white" data-testid={`button-submit-reset-tenant-admin-staff-${staff.username}`}>Reset password</button>
        </form>
      )}
    </div>
  );
}

function StaffAssignmentSection({ staff, workspaces, customerName }: { staff: Staff[]; workspaces: Workspace[]; customerName: string }) {
  const client = useQueryClient();
  const update = useUpdateTenantAdminStaffAssignments();
  const status = useUpdateTenantAdminStaffStatus();
  const deleteStaff = useDeleteTenantAdminStaff();
  const create = useCreateTenantAdminStaff();

  const [creating, setCreating] = useState(false);

  const save = async (accountId: string, workspaceKeys: string[]) => {
    await update.mutateAsync({ accountId, data: { workspaceKeys } });
    await refresh(client);
  };

  const handleCreate = async (data: { username: string; displayName: string; temporaryPassword: string; workspaceKeys: string[] }) => {
    await create.mutateAsync({ data });
    await refresh(client);
    setCreating(false);
  };

  const handleToggleStatus = async (accountId: string, isActive: boolean) => {
    await status.mutateAsync({ accountId, data: { active: !isActive } });
    await refresh(client);
  };

  const handleDelete = async (accountId: string) => {
    await deleteStaff.mutateAsync({ accountId });
    await refresh(client);
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-6">
        <div>
          <h3 className="font-mono text-sm uppercase tracking-[.15em]">{customerName} Admin Staff Workspace Assignment</h3>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Assign tenant admin staff to one or more {customerName} Admin Staff Workspaces.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] px-4 py-3 font-mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--primary-foreground))]" data-testid="button-create-tenant-admin-staff-start">
          <UserPlus className="h-3.5 w-3.5" /> Add New
        </button>
      </div>

      {creating && (
        <div className="mt-8">
          <StaffWorkspaceCard
            mode="create"
            roleLabel={`${customerName} Admin Staff`}
            workspaces={workspaces}
            onClose={() => setCreating(false)}
            onCreate={handleCreate}
            pending={create.isPending}
            error={create.isError}
            testIdPrefix="tenant-admin-staff-workspace-assignment"
          />
        </div>
      )}

      <div className="mt-8 grid gap-4">
        {staff.map((member) => (
          <StaffWorkspaceCard
            key={member.id}
            mode="edit"
            defaultDisplayName={member.displayName}
            defaultUsername={member.username}
            roleLabel={`${customerName} Admin Staff`}
            workspaces={workspaces}
            defaultWorkspaceKeys={member.workspaceKeys}
            isActive={member.isActive}
            onSave={(keys) => save(member.id, keys)}
            onSuspend={() => handleToggleStatus(member.id, member.isActive)}
            onReactivate={() => handleToggleStatus(member.id, member.isActive)}
            onDelete={() => handleDelete(member.id)}
            pending={update.isPending || status.isPending || deleteStaff.isPending}
            error={update.isError || status.isError || deleteStaff.isError}
            testIdPrefix="tenant-admin-staff-workspace-assignment"
          />
        ))}
        {!staff.length && <p className="border border-[hsl(var(--border))] p-8 text-center font-mono text-xs uppercase text-[hsl(var(--muted-foreground))]">No {customerName} Admin Staff available for workspace assignment</p>}
      </div>
    </div>
  );
}
function WorkspaceSection({ workspaces, customerName }: { workspaces: Workspace[]; customerName: string }) {
  const client = useQueryClient();
  const create = useCreateTenantAdminStaffWorkspace();
  const updateMetadata = useUpdateTenantAdminStaffWorkspace();
  const updateAccess = useUpdateTenantAdminStaffWorkspaceAccess();
  const remove = useRemoveTenantAdminStaffWorkspace();
  const addHierarchyNode = useAddTenantAdminStaffWorkspaceHierarchyNode();
  const updateHierarchyNode = useUpdateTenantAdminStaffWorkspaceHierarchyNode();
  const removeHierarchyNode = useRemoveTenantAdminStaffWorkspaceHierarchyNode();
  const afterAttempt = async () => { await refresh(client).catch(() => undefined); };

  const handleCreate = async (data: WorkspaceMetadataRequest) => {
    try { await create.mutateAsync({ data }); } finally { await afterAttempt(); }
  };
  const handleUpdateMetadata = async (workspaceKey: string, data: WorkspaceMetadataRequest) => {
    try { await updateMetadata.mutateAsync({ workspaceKey, data }); } finally { await afterAttempt(); }
  };
  const handleUpdateAccess = async (workspaceKey: string, controls: { nodeId: string; accessLevel: WorkspaceAccessLevel }[]) => {
    try { await updateAccess.mutateAsync({ workspaceKey, data: { controls } }); } finally { await afterAttempt(); }
  };
  const handleRemove = async (workspaceKey: string) => {
    try { await remove.mutateAsync({ workspaceKey }); } finally { await afterAttempt(); }
  };
  const handleAddHierarchyNode = async (data: WorkspaceHierarchyNodeInput) => {
    try { await addHierarchyNode.mutateAsync({ data }); } finally { await afterAttempt(); }
  };
  const handleUpdateHierarchyNode = async (nodeType: WorkspaceContentNodeType, nodeKey: string, data: WorkspaceHierarchyNodeUpdate) => {
    try { await updateHierarchyNode.mutateAsync({ nodeType, nodeKey, data }); } finally { await afterAttempt(); }
  };
  const handleRemoveHierarchyNode = async (nodeType: WorkspaceContentNodeType, nodeKey: string) => {
    try { await removeHierarchyNode.mutateAsync({ nodeType, nodeKey }); } finally { await afterAttempt(); }
  };

  return <WorkspaceControlUI title={`${customerName} Admin Staff Workspaces`} description={`Manage semantic workspace access for ${customerName} Admin Staff.`} workspaces={workspaces as UnifiedWorkspace[]} isLoading={false} isError={false} isMatrix={true} createPending={create.isPending} createError={create.isError} onCreate={handleCreate} updateMetadataPending={updateMetadata.isPending} updateMetadataError={updateMetadata.isError} onUpdateMetadata={handleUpdateMetadata} updateAccessPending={updateAccess.isPending} updateAccessError={updateAccess.isError} onUpdateAccess={handleUpdateAccess} removePending={remove.isPending} removeError={remove.isError} onRemove={handleRemove} addHierarchyNodePending={addHierarchyNode.isPending} updateHierarchyNodePending={updateHierarchyNode.isPending} removeHierarchyNodePending={removeHierarchyNode.isPending} onAddHierarchyNode={handleAddHierarchyNode} onUpdateHierarchyNode={handleUpdateHierarchyNode} onRemoveHierarchyNode={handleRemoveHierarchyNode} />;
}