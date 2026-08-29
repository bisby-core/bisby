import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { TenantRegistry } from "./contracts";
import { parseTenantSubdomain } from "./subdomain";
import { toTenantContext } from "./tenant-context";
import { TenantConnectionManager } from "./tenant-connection-manager";

export interface DatabaseRouterOptions {
  readonly registry: TenantRegistry;
  readonly connections: TenantConnectionManager;
  readonly rootDomain?: string;
}

function reject(res: Response, status: number, code: string): void {
  res.status(status).json({ error: code });
}

/**
 * Resolves the tenant database before downstream API handlers execute.
 * Express's hostname is used instead of a client-provided tenant id or URL.
 */
export function createDatabaseRouter(
  options: DatabaseRouterOptions,
): RequestHandler {
  return async function databaseRouter(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const parsed = parseTenantSubdomain(req.hostname, options.rootDomain);

    if (parsed.kind === "non-tenant") {
      reject(res, 400, "tenant_subdomain_required");
      return;
    }

    try {
      const record = await options.registry.findBySubdomain(parsed.subdomain);

      if (!record) {
        reject(res, 404, "tenant_not_found");
        return;
      }

      if (!record.active) {
        reject(res, 403, "tenant_inactive");
        return;
      }

      req.tenantDatabase = await options.connections.getConnection(record);
      req.tenantContext = toTenantContext(record);
      next();
    } catch (error) {
      next(error);
    }
  };
}