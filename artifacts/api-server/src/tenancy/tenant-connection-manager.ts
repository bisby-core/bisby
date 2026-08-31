import type { Knex } from "knex";
import type { TenantRegistryRecord } from "./contracts";
import { createPostgresClient } from "../db/knex";

/**
 * Keeps one bounded Knex pool per tenant database. The database name is
 * sourced exclusively from the master registry and is never returned through
 * the request context.
 */
export class TenantConnectionManager {
  private readonly connections = new Map<string, Promise<Knex>>();

  public async getConnection(record: TenantRegistryRecord): Promise<Knex> {
    const existing = this.connections.get(record.tenantId);
    if (existing) {
      return existing;
    }

    const pending = this.openConnection(record);
    this.connections.set(record.tenantId, pending);

    try {
      return await pending;
    } catch (error) {
      this.connections.delete(record.tenantId);
      throw error;
    }
  }

  public async closeAll(): Promise<void> {
    const connections = await Promise.all(this.connections.values());
    await Promise.all(connections.map((connection) => connection.destroy()));
    this.connections.clear();
  }

  private async openConnection(record: TenantRegistryRecord): Promise<Knex> {
    const connection = createPostgresClient({
      databaseName: record.databaseName,
    });

    try {
      await connection.raw("select 1");
      return connection;
    } catch (error) {
      await connection.destroy();
      throw error;
    }
  }
}