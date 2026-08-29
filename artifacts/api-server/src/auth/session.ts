import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "bisby_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface LocalSession {
  readonly accountId: string;
  readonly tenantId: string;
  readonly role: "staff" | "client";
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

export function getSessionSecret(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const secret = environment["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured for local sessions.");
  }
  return secret;
}

export function createSessionToken(
  session: Omit<LocalSession, "expiresAt">,
  secret: string,
  now = Date.now(),
): string {
  const payload: LocalSession = {
    ...session,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): LocalSession | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }

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
    const session = JSON.parse(decode(encodedPayload)) as LocalSession;
    if (
      typeof session.accountId !== "string" ||
      typeof session.tenantId !== "string" ||
      (session.role !== "staff" && session.role !== "client") ||
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