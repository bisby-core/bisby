import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret, SESSION_TTL_SECONDS } from "../auth/session";

export const PLATFORM_STAFF_SESSION_COOKIE_NAME = "bisby_platform_staff_session";

export interface PlatformStaffSession {
  readonly accountId: string;
  readonly expiresAt: number;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createPlatformStaffSessionToken(
  accountId: string,
  secret = getSessionSecret(),
  now = Date.now(),
): string {
  const payload: PlatformStaffSession = {
    accountId,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyPlatformStaffSessionToken(
  token: string,
  secret = getSessionSecret(),
  now = Date.now(),
): PlatformStaffSession | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const encoded = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(sign(encoded, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PlatformStaffSession;
    return typeof session.accountId === "string" && session.accountId &&
      Number.isInteger(session.expiresAt) && session.expiresAt > now
      ? session
      : null;
  } catch {
    return null;
  }
}

export function serializePlatformStaffSessionCookie(token: string, secure: boolean): string {
  return [
    `${PLATFORM_STAFF_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearPlatformStaffSessionCookie(secure: boolean): string {
  return [
    `${PLATFORM_STAFF_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function readPlatformStaffSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== PLATFORM_STAFF_SESSION_COOKIE_NAME) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}