import type { Knex } from "knex";
import { hashPassword, verifyPassword } from "../auth/password";
import { recordPlatformAudit } from "./control-plane";
import { listPlatformWorkspaces, type ManagedPlatformWorkspace } from "./workspaces";

interface PlatformStaffRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly password_hash?: string;
  readonly is_active: boolean;
  readonly must_change_password: boolean;
  readonly created_at: Date | string;
  readonly updated_at?: Date | string;
}

interface WorkspaceRow {
  readonly workspace_key: string;
  readonly display_name: string;
  readonly is_active: boolean;
}

export interface PlatformStaff {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly requiresPasswordChange: boolean;
  readonly createdAt: string;
  readonly workspaceKeys: readonly string[];
}

export interface PlatformStaffWorkspace {
  readonly workspaceKey: string;
  readonly displayName: string;
  readonly isActive: boolean;
}

export interface PlatformStaffSnapshot {
  readonly staff: readonly PlatformStaff[];
  readonly workspaces: readonly PlatformStaffWorkspace[];
}
export interface PlatformStaffAccount {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly requiresPasswordChange: boolean;
}

export class PlatformStaffError extends Error {
  public constructor(
    public readonly code:
      | "platform_staff_not_found"
      | "platform_staff_conflict"
      | "platform_staff_workspace_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PlatformStaffError";
  }
}

function serializeStaff(
  row: PlatformStaffRow,
  workspaceKeys: readonly string[],
): PlatformStaff {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isActive: row.is_active,
    requiresPasswordChange: row.must_change_password,
    createdAt: new Date(row.created_at).toISOString(),
    workspaceKeys,
  };
}

async function requireStaff(
  database: Knex,
  platformStaffId: string,
): Promise<PlatformStaffRow> {
  const row = await database<PlatformStaffRow>("platform_staff_accounts")
    .select("id", "username", "display_name", "is_active", "must_change_password", "created_at")
    .where({ id: platformStaffId })
    .first();
  if (!row) {
    throw new PlatformStaffError(
      "platform_staff_not_found",
      "That platform staff account was not found.",
    );
  }
  return row;
}

async function validateWorkspaceKeys(
  database: Knex,
  workspaceKeys: readonly string[],
): Promise<string[]> {
  const uniqueKeys = [...new Set(workspaceKeys)];
  if (uniqueKeys.length === 0 || uniqueKeys.length !== workspaceKeys.length) {
    throw new PlatformStaffError(
      "platform_staff_workspace_invalid",
      "Platform staff must be assigned at least one unique active platform workspace.",
    );
  }
  const rows = await database<WorkspaceRow>("platform_workspaces")
    .select("workspace_key")
    .whereIn("workspace_key", uniqueKeys)
    .andWhere({ is_active: true });
  if (rows.length !== uniqueKeys.length) {
    throw new PlatformStaffError(
      "platform_staff_workspace_invalid",
      "Platform staff can only be assigned to existing active platform workspaces.",
    );
  }
  return uniqueKeys;
}

async function assignedWorkspaceKeys(
  database: Knex,
  platformStaffId: string,
): Promise<string[]> {
  const rows = await database("platform_staff_workspace_assignments")
    .select("workspace_key")
    .where({ platform_staff_id: platformStaffId })
    .orderBy("workspace_key", "asc");
  return rows.map((row) => row.workspace_key as string);
}

export async function getPlatformStaffSnapshot(
  database: Knex,
): Promise<PlatformStaffSnapshot> {
  const [staffRows, workspaceRows, assignments] = await Promise.all([
    database<PlatformStaffRow>("platform_staff_accounts")
      .select("id", "username", "display_name", "is_active", "must_change_password", "created_at")
      .orderBy("username", "asc"),
    database<WorkspaceRow>("platform_workspaces")
      .select("workspace_key", "display_name", "is_active")
      .orderBy("sort_order", "asc"),
    database("platform_staff_workspace_assignments")
      .select("platform_staff_id", "workspace_key")
      .orderBy("workspace_key", "asc"),
  ]);
  const keysByStaff = new Map<string, string[]>();
  for (const assignment of assignments) {
    const keys = keysByStaff.get(assignment.platform_staff_id) ?? [];
    keys.push(assignment.workspace_key);
    keysByStaff.set(assignment.platform_staff_id, keys);
  }
  return {
    staff: staffRows.map((row) => serializeStaff(row, keysByStaff.get(row.id) ?? [])),
    workspaces: workspaceRows.map((row) => ({
      workspaceKey: row.workspace_key,
      displayName: row.display_name,
      isActive: row.is_active,
    })),
  };
}

export async function createPlatformStaff(
  database: Knex,
  actorUsername: string,
  input: {
    username: string;
    displayName: string;
    temporaryPassword: string;
    workspaceKeys: readonly string[];
  },
): Promise<{ status: "platform_staff_created"; platformStaff: PlatformStaff }> {
  const passwordHash = await hashPassword(input.temporaryPassword);
  try {
    return await database.transaction(async (transaction) => {
      const workspaceKeys = await validateWorkspaceKeys(transaction, input.workspaceKeys);
      const [row] = await transaction<PlatformStaffRow>("platform_staff_accounts")
        .insert({
          username: input.username,
          display_name: input.displayName,
          password_hash: passwordHash,
          is_active: true,
          must_change_password: true,
        })
        .returning(["id", "username", "display_name", "is_active", "must_change_password", "created_at"]);
      await transaction("platform_staff_workspace_assignments").insert(
        workspaceKeys.map((workspaceKey) => ({
          platform_staff_id: row.id,
          workspace_key: workspaceKey,
        })),
      );
      await recordPlatformAudit(transaction, {
        eventType: "owner.platform_staff.created",
        actorUsername,
        details: { platformStaffId: row.id, username: row.username },
      });
      return {
        status: "platform_staff_created",
        platformStaff: serializeStaff(row, workspaceKeys),
      };
    });
  } catch (error) {
    if (error instanceof PlatformStaffError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new PlatformStaffError(
        "platform_staff_conflict",
        "That platform staff username is already in use.",
      );
    }
    throw error;
  }
}

function serializeAccount(row: Pick<PlatformStaffRow, "id" | "username" | "display_name" | "is_active" | "must_change_password">): PlatformStaffAccount {
  return { id: row.id, username: row.username, displayName: row.display_name, isActive: row.is_active, requiresPasswordChange: row.must_change_password };
}

export async function getPlatformStaffAccount(database: Knex, id: string): Promise<PlatformStaffAccount | null> {
  const row = await database<PlatformStaffRow>("platform_staff_accounts")
    .select("id", "username", "display_name", "is_active", "must_change_password")
    .where({ id }).first();
  return row ? serializeAccount(row) : null;
}

export async function verifyPlatformStaffCredentials(database: Knex, username: string, password: string): Promise<PlatformStaffAccount | null> {
  const row = await database<PlatformStaffRow>("platform_staff_accounts")
    .select("id", "username", "display_name", "password_hash", "is_active", "must_change_password")
    .where({ username }).first();
  if (!row || !row.is_active || !row.password_hash || !(await verifyPassword(password, row.password_hash))) return null;
  return serializeAccount(row);
}

export async function changePlatformStaffPassword(database: Knex, id: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  return database.transaction(async (transaction) => {
    const row = await transaction<PlatformStaffRow>("platform_staff_accounts")
      .select("id", "password_hash", "is_active").where({ id }).forUpdate().first();
    if (!row?.is_active || !row.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) return false;
    return (await transaction("platform_staff_accounts").where({ id, password_hash: row.password_hash, is_active: true }).update({
      password_hash: passwordHash, must_change_password: false, updated_at: transaction.fn.now(),
    })) === 1;
  });
}

export async function getAssignedPlatformStaffWorkspaces(database: Knex, platformStaffId: string): Promise<readonly ManagedPlatformWorkspace[]> {
  const assigned = await database("platform_staff_workspace_assignments as assignments")
    .join("platform_workspaces as workspaces", "workspaces.workspace_key", "assignments.workspace_key")
    .where("assignments.platform_staff_id", platformStaffId)
    .andWhere("workspaces.is_active", true)
    .select("assignments.workspace_key");
  const keys = new Set(assigned.map((row) => row.workspace_key as string));
  const { workspaces } = await listPlatformWorkspaces(database);
  return workspaces.filter((workspace): workspace is ManagedPlatformWorkspace =>
    keys.has(workspace.workspaceKey) && "contentNodes" in workspace,
  );
}

export async function getAssignedPlatformStaffWorkspace(database: Knex, platformStaffId: string, workspaceKey: string): Promise<ManagedPlatformWorkspace | null> {
  const workspaces = await getAssignedPlatformStaffWorkspaces(database, platformStaffId);
  return workspaces.find((workspace) => workspace.workspaceKey === workspaceKey) ?? null;
}

export async function updatePlatformStaffWorkspaces(
  database: Knex,
  actorUsername: string,
  platformStaffId: string,
  workspaceKeysInput: readonly string[],
): Promise<{ status: "platform_staff_workspaces_updated"; platformStaff: PlatformStaff }> {
  return database.transaction(async (transaction) => {
    const staff = await requireStaff(transaction, platformStaffId);
    const workspaceKeys = await validateWorkspaceKeys(transaction, workspaceKeysInput);
    await transaction("platform_staff_workspace_assignments")
      .where({ platform_staff_id: platformStaffId })
      .delete();
    await transaction("platform_staff_workspace_assignments").insert(
      workspaceKeys.map((workspaceKey) => ({
        platform_staff_id: platformStaffId,
        workspace_key: workspaceKey,
      })),
    );
    await recordPlatformAudit(transaction, {
      eventType: "owner.platform_staff.workspaces_updated",
      actorUsername,
      details: { platformStaffId, username: staff.username, workspaceKeys },
    });
    return {
      status: "platform_staff_workspaces_updated",
      platformStaff: serializeStaff(staff, workspaceKeys),
    };
  });
}

export async function updatePlatformStaffStatus(
  database: Knex,
  actorUsername: string,
  platformStaffId: string,
  active: boolean,
): Promise<{ status: "platform_staff_status_updated"; platformStaff: PlatformStaff }> {
  return database.transaction(async (transaction) => {
    const staff = await requireStaff(transaction, platformStaffId);
    const workspaceKeys = await assignedWorkspaceKeys(transaction, platformStaffId);
    if (active) await validateWorkspaceKeys(transaction, workspaceKeys);
    const [updated] = await transaction<PlatformStaffRow>("platform_staff_accounts")
      .where({ id: platformStaffId })
      .update({ is_active: active, updated_at: transaction.fn.now() })
      .returning(["id", "username", "display_name", "is_active", "must_change_password", "created_at"]);
    await recordPlatformAudit(transaction, {
      eventType: active ? "owner.platform_staff.activated" : "owner.platform_staff.deactivated",
      actorUsername,
      details: { platformStaffId, username: staff.username },
    });
    return {
      status: "platform_staff_status_updated",
      platformStaff: serializeStaff(updated, workspaceKeys),
    };
  });
}

export async function deletePlatformStaff(
  database: Knex,
  actorUsername: string,
  platformStaffId: string,
): Promise<{ status: "platform_staff_deleted"; platformStaffId: string; deleted: true }> {
  return database.transaction(async (transaction) => {
    const staff = await requireStaff(transaction, platformStaffId);
    await recordPlatformAudit(transaction, {
      eventType: "owner.platform_staff.deleted",
      actorUsername,
      details: { platformStaffId, username: staff.username },
    });
    const deleted = await transaction("platform_staff_accounts")
      .where({ id: platformStaffId })
      .delete();
    if (deleted !== 1) {
      throw new PlatformStaffError(
        "platform_staff_not_found",
        "That platform staff account was not found.",
      );
    }
    return { status: "platform_staff_deleted", platformStaffId, deleted: true };
  });
}

export async function resetPlatformStaffTemporaryPassword(
  database: Knex,
  actorUsername: string,
  platformStaffId: string,
  temporaryPassword: string,
): Promise<{ status: "platform_staff_temporary_password_reset"; platformStaffId: string; requiresPasswordChange: true }> {
  const passwordHash = await hashPassword(temporaryPassword);
  return database.transaction(async (transaction) => {
    const staff = await requireStaff(transaction, platformStaffId);
    await transaction("platform_staff_accounts").where({ id: platformStaffId }).update({
      password_hash: passwordHash,
      must_change_password: true,
      updated_at: transaction.fn.now(),
    });
    await recordPlatformAudit(transaction, {
      eventType: "owner.platform_staff.temporary_password_reset",
      actorUsername,
      details: { platformStaffId, username: staff.username },
    });
    return {
      status: "platform_staff_temporary_password_reset",
      platformStaffId,
      requiresPasswordChange: true,
    };
  });
}