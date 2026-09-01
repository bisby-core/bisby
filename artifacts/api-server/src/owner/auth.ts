import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  clearOwnerSessionCookie,
  readOwnerSessionCookie,
  verifyOwnerSessionToken,
} from "./session";

export function isRootHost(hostname: string, rootDomain: string): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/\.$/, "");
  const normalizedRoot = rootDomain.toLowerCase().replace(/^\.+|\.+$/g, "");
  if (
    normalizedHost === normalizedRoot ||
    normalizedHost === `www.${normalizedRoot}`
  ) {
    return true;
  }
  return (
    process.env["NODE_ENV"] !== "production" &&
    (normalizedHost === "localhost" ||
      normalizedHost === "127.0.0.1" ||
      normalizedHost.endsWith(".replit.dev"))
  );
}

export function usesSecureCookie(req: Request): boolean {
  return process.env["NODE_ENV"] === "production" || req.secure;
}

export function createOwnerAuthMiddleware(rootDomain: string): RequestHandler {
  return function ownerAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const token = readOwnerSessionCookie(req.headers.cookie);
    if (!token) {
      next();
      return;
    }

    try {
      const session = verifyOwnerSessionToken(token);
      if (session) {
        req.ownerUsername = session.username;
      } else if (isRootHost(req.hostname, rootDomain)) {
        res.setHeader("Set-Cookie", clearOwnerSessionCookie(usesSecureCookie(req)));
      }
    } catch {
      if (isRootHost(req.hostname, rootDomain)) {
        res.setHeader("Set-Cookie", clearOwnerSessionCookie(usesSecureCookie(req)));
      }
    }
    next();
  };
}

export function requireOwnerSession(
  req: Request,
  res: Response,
): boolean {
  if (req.ownerUsername) return true;
  res.status(401).json({ error: "owner_authentication_required" });
  return false;
}