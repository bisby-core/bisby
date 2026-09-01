import { useQueryClient } from '@tanstack/react-query';
import {
  useGetModuleWorkspaceControl,
  getGetModuleWorkspaceControlQueryKey,
  getGetTenantAdministrationQueryKey,
  getGetPublicTenantWorkspacesQueryKey,
  useCreateModuleWorkspace,
  useRemoveModuleWorkspace,
  useUpdateModuleWorkspaceAccess,
  useUpdateModuleWorkspaceMetadata,
  useGetTenantWorkspaces,
  getGetTenantWorkspacesQueryKey,
  useCreateTenantWorkspace,
  useRemoveTenantWorkspace,
  useUpdateTenantWorkspaceAccess,
  useUpdateTenantWorkspace,
  type WorkspaceAccessLevel,
  type WorkspaceMetadataRequest,
} from '@workspace/api-client-react';
import { WorkspaceControlUI, type UnifiedWorkspace } from './WorkspaceControlUI';

type UnifiedWorkspaceMetadataHandler = (
  metadata: WorkspaceMetadataRequest,
) => Promise<void>;
type UnifiedWorkspaceAccessHandler = (
  controls: { nodeId: string; accessLevel: WorkspaceAccessLevel }[],
) => Promise<void>;

export function ModuleWorkspaceControl() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetModuleWorkspaceControl();

  const create = useCreateModuleWorkspace();
  const updateMetadata = useUpdateModuleWorkspaceMetadata();
  const updateAccess = useUpdateModuleWorkspaceAccess();
  const remove = useRemoveModuleWorkspace();

  const handleCreate = async (metadata: Parameters<UnifiedWorkspaceMetadataHandler>[0]) => {
    const workspace = await create.mutateAsync({ data: { displayName: metadata.displayName } });
    await updateMetadata.mutateAsync({
      workspaceKey: workspace.workspaceKey,
      data: metadata,
    });
    await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdministrationQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  const handleUpdateMetadata = async (workspaceKey: string, metadata: Parameters<UnifiedWorkspaceMetadataHandler>[0]) => {
    await updateMetadata.mutateAsync({ workspaceKey, data: metadata });
    await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  const handleUpdateAccess = async (workspaceKey: string, controls: Parameters<UnifiedWorkspaceAccessHandler>[0]) => {
    await updateAccess.mutateAsync({ workspaceKey, data: { controls } });
    await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey() });
  };

  const handleRemove = async (workspaceKey: string) => {
    await remove.mutateAsync({ workspaceKey });
    await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdministrationQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  return (
    <WorkspaceControlUI
      title="Module Workspaces"
      description="Manage live workspaces and define access controls for your module."
      workspaces={(data?.workspaces || []) as UnifiedWorkspace[]}
      isLoading={isLoading}
      isError={isError}
      createPending={create.isPending}
      createError={create.isError}
      onCreate={handleCreate}
      updateMetadataPending={updateMetadata.isPending}
      updateMetadataError={updateMetadata.isError}
      onUpdateMetadata={handleUpdateMetadata}
      updateAccessPending={updateAccess.isPending}
      updateAccessError={updateAccess.isError}
      onUpdateAccess={handleUpdateAccess}
      removePending={remove.isPending}
      removeError={remove.isError}
      onRemove={handleRemove}
    />
  );
}

export function TenantWorkspaceControl() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetTenantWorkspaces();

  const create = useCreateTenantWorkspace();
  const updateMetadata = useUpdateTenantWorkspace();
  const updateAccess = useUpdateTenantWorkspaceAccess();
  const remove = useRemoveTenantWorkspace();

  const handleCreate = async (metadata: Parameters<UnifiedWorkspaceMetadataHandler>[0]) => {
    await create.mutateAsync({ data: metadata });
    await queryClient.invalidateQueries({ queryKey: getGetTenantWorkspacesQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdministrationQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  const handleUpdateMetadata = async (workspaceKey: string, metadata: Parameters<UnifiedWorkspaceMetadataHandler>[0]) => {
    await updateMetadata.mutateAsync({ workspaceKey, data: metadata });
    await queryClient.invalidateQueries({ queryKey: getGetTenantWorkspacesQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  const handleUpdateAccess = async (workspaceKey: string, controls: Parameters<UnifiedWorkspaceAccessHandler>[0]) => {
    await updateAccess.mutateAsync({ workspaceKey, data: { controls } });
    await queryClient.invalidateQueries({ queryKey: getGetTenantWorkspacesQueryKey() });
  };

  const handleRemove = async (workspaceKey: string) => {
    await remove.mutateAsync({ workspaceKey });
    await queryClient.invalidateQueries({ queryKey: getGetTenantWorkspacesQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdministrationQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  return (
    <WorkspaceControlUI
      title="Tenant Workspaces"
      description="Manage tenant-wide workspaces and define access controls."
      workspaces={(data?.workspaces || []) as UnifiedWorkspace[]}
      isLoading={isLoading}
      isError={isError}
      createPending={create.isPending}
      createError={create.isError}
      onCreate={handleCreate}
      updateMetadataPending={updateMetadata.isPending}
      updateMetadataError={updateMetadata.isError}
      onUpdateMetadata={handleUpdateMetadata}
      updateAccessPending={updateAccess.isPending}
      updateAccessError={updateAccess.isError}
      onUpdateAccess={handleUpdateAccess}
      removePending={remove.isPending}
      removeError={remove.isError}
      onRemove={handleRemove}
    />
  );
}
