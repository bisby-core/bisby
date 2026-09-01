import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "./session";

interface AccountRow {
  id: string;
  account_type: string;
  is_active: boolean;
  must_change_password: boolean;
}

function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function usesSecureCookie(req: Request): boolean {
  return process.env["NODE_ENV"] === "production" || req.secure;
}

export function serializeSessionCookie(
  token: string,
  secure: boolean,
): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function toRole(value: string): "staff" | "client" {
  return value === "staff" ? "staff" : "client";
}

export function createLocalAuthMiddleware(): RequestHandler {
  return async function localAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (req.path === "/auth/login") {
      next();
      return;
    }

    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (!token || !req.tenantContext || !req.tenantDatabase) {
      next();
      return;
    }

    try {
      const session = verifySessionToken(token, getSessionSecret());
      if (!session || session.tenantId !== req.tenantContext.tenantId) {
        res.setHeader(
          "Set-Cookie",
          clearSessionCookie(usesSecureCookie(req)),
        );
        next();
        return;
      }

      const account = await req.tenantDatabase<AccountRow>(
        "core_admin.client_accounts",
      )
        .select("id", "account_type", "is_active", "must_change_password")
        .where({ id: session.accountId })
        .first();

      if (!account || !account.is_active) {
        res.setHeader(
          "Set-Cookie",
          clearSessionCookie(usesSecureCookie(req)),
        );
        next();
        return;
      }

      req.authenticatedUser = {
        accountId: account.id,
        tenantId: req.tenantContext.tenantId,
        role: toRole(account.account_type),
          requiresPasswordChange: account.must_change_password,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}