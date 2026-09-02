import { useQueryClient } from '@tanstack/react-query';
import {
  useGetModuleWorkspaceControl,
  getGetModuleWorkspaceControlQueryKey,
  getGetTenantAdminQueryKey,
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
  useAddModuleWorkspaceHierarchyNode,
  useUpdateModuleWorkspaceHierarchyNode,
  useRemoveModuleWorkspaceHierarchyNode,
  type WorkspaceAccessLevel,
  type WorkspaceMetadataRequest,
  type WorkspaceHierarchyNodeInput,
  type WorkspaceHierarchyNodeUpdate,
  type WorkspaceContentNodeType,
  type ModuleKey,
} from '@workspace/api-client-react';
import { WorkspaceControlUI, type UnifiedWorkspace } from './WorkspaceControlUI';

type UnifiedWorkspaceMetadataHandler = (
  metadata: WorkspaceMetadataRequest,
) => Promise<void>;
type UnifiedWorkspaceAccessHandler = (
  controls: { nodeId: string; accessLevel: WorkspaceAccessLevel }[],
) => Promise<void>;

export function ModuleWorkspaceControl({ readOnly, moduleKey }: { readOnly?: boolean; moduleKey?: string }) {
  const queryClient = useQueryClient();
  const params = moduleKey ? { moduleKey: moduleKey as ModuleKey } : undefined;
  const { data, isLoading, isError } = useGetModuleWorkspaceControl(params);

  const create = useCreateModuleWorkspace();
  const updateMetadata = useUpdateModuleWorkspaceMetadata();
  const updateAccess = useUpdateModuleWorkspaceAccess();
  const remove = useRemoveModuleWorkspace();

  const addHierarchyNode = useAddModuleWorkspaceHierarchyNode();
  const updateHierarchyNode = useUpdateModuleWorkspaceHierarchyNode();
  const removeHierarchyNode = useRemoveModuleWorkspaceHierarchyNode();

  const handleCreate = async (metadata: Parameters<UnifiedWorkspaceMetadataHandler>[0]) => {
    const workspace = await create.mutateAsync({ data: { displayName: metadata.displayName } });
    await updateMetadata.mutateAsync({
      workspaceKey: workspace.workspaceKey,
      data: metadata,
    });
    await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  const handleUpdateMetadata = async (workspaceKey: string, metadata: Parameters<UnifiedWorkspaceMetadataHandler>[0]) => {
    await updateMetadata.mutateAsync({ workspaceKey, data: metadata });
    await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  const handleUpdateAccess = async (workspaceKey: string, controls: Parameters<UnifiedWorkspaceAccessHandler>[0]) => {
    try {
      await updateAccess.mutateAsync({ workspaceKey, data: { controls } });
    } finally {
      await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
    }
  };

  const handleRemove = async (workspaceKey: string) => {
    try {
      await remove.mutateAsync({ workspaceKey });
    } finally {
      await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
      await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
    }
  };

  const handleAddHierarchyNode = async (data: WorkspaceHierarchyNodeInput) => {
    try {
      await addHierarchyNode.mutateAsync({ data });
    } finally {
      await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
    }
  };
  const handleUpdateHierarchyNode = async (nodeType: WorkspaceContentNodeType, nodeKey: string, data: WorkspaceHierarchyNodeUpdate) => {
    try {
      await updateHierarchyNode.mutateAsync({ nodeType, nodeKey, data });
    } finally {
      await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
    }
  };
  const handleRemoveHierarchyNode = async (nodeType: WorkspaceContentNodeType, nodeKey: string) => {
    try {
      await removeHierarchyNode.mutateAsync({ nodeType, nodeKey });
    } finally {
      await queryClient.invalidateQueries({ queryKey: getGetModuleWorkspaceControlQueryKey(params) });
    }
  };

  return (
    <WorkspaceControlUI
      title="Module Workspaces"
      description="Manage module workspaces and cross-workspace hierarchy access controls."
      workspaces={(data?.workspaces || []) as UnifiedWorkspace[]}
      isLoading={isLoading}
      isError={isError}
      readOnly={readOnly}
      isMatrix={true}
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

      addHierarchyNodePending={addHierarchyNode.isPending}
      updateHierarchyNodePending={updateHierarchyNode.isPending}
      removeHierarchyNodePending={removeHierarchyNode.isPending}
      onAddHierarchyNode={handleAddHierarchyNode}
      onUpdateHierarchyNode={handleUpdateHierarchyNode}
      onRemoveHierarchyNode={handleRemoveHierarchyNode}
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
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
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
    await queryClient.invalidateQueries({ queryKey: getGetTenantAdminQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetPublicTenantWorkspacesQueryKey() });
  };

  return (
    <WorkspaceControlUI
      title="Public Entries"
       description="Manage organization-level Public Information and Contact Us entries."
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
