import { createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_SESSION_COOKIE_NAME = "bisby_owner_session";
const OWNER_SESSION_TTL_SECONDS = 8 * 60 * 60;

interface OwnerSession {
  readonly username: string;
  readonly expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function readCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === OWNER_SESSION_COOKIE_NAME) return value.join("=");
  }
  return null;
}

function serialize(token: string, secure: boolean, maxAge = OWNER_SESSION_TTL_SECONDS): string {
  return [
    `${OWNER_SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function getOwnerCredentials(environment: NodeJS.ProcessEnv = process.env): { username: string; password: string } | null {
  const username = environment["BISBY_OWNER_USERNAME"];
  const password = environment["BISBY_OWNER_PASSWORD"];
  return username && password ? { username, password } : null;
}

export function createOwnerSession(username: string, secret: string): string {
  const payload = encode(JSON.stringify({ username, expiresAt: Date.now() + OWNER_SESSION_TTL_SECONDS * 1000 }));
  return `${payload}.${sign(payload, secret)}`;
}

export function ownerSessionFromRequest(cookieHeader: string | undefined, secret: string): OwnerSession | null {
  const token = readCookie(cookieHeader);
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OwnerSession;
    return typeof session.username === "string" && typeof session.expiresAt === "number" && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function ownerSessionCookie(token: string, secure: boolean): string {
  return serialize(token, secure);
}

export function clearOwnerSessionCookie(secure: boolean): string {
  return serialize("", secure, 0);
}
