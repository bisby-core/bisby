import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getSessionSecret,
  SESSION_TTL_SECONDS,
} from "../auth/session";

export const OWNER_SESSION_COOKIE_NAME = "bisby_owner_session";

export interface OwnerSession {
  readonly username: string;
  readonly expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createOwnerSessionToken(
  username: string,
  secret = getSessionSecret(),
  now = Date.now(),
): string {
  const payload: OwnerSession = {
    username,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyOwnerSessionToken(
  token: string,
  secret = getSessionSecret(),
  now = Date.now(),
): OwnerSession | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encodedPayload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(decode(encodedPayload)) as OwnerSession;
    if (
      typeof session.username !== "string" ||
      !session.username ||
      !Number.isInteger(session.expiresAt) ||
      session.expiresAt <= now
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function serializeOwnerSessionCookie(
  token: string,
  secure: boolean,
): string {
  return [
    `${OWNER_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearOwnerSessionCookie(secure: boolean): string {
  return [
    `${OWNER_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function readOwnerSessionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== OWNER_SESSION_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
