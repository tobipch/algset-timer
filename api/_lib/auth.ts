import crypto from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Single-user password auth: APP_PASSWORD is set as a Vercel env var. The
// session cookie is a stateless HMAC derived from the password, so no session
// table is needed. If APP_PASSWORD is unset, the app is open (local dev).
export const SESSION_COOKIE = "algset_session";
export const SESSION_TTL_S = 180 * 24 * 60 * 60; // 180 days

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (process.env.NODE_ENV !== "development") parts.push("Secure");
  return parts.join("; ");
}

export const authRequired = (): boolean => !!process.env.APP_PASSWORD;

export function sessionToken(): string {
  const password = process.env.APP_PASSWORD || "";
  return crypto.createHmac("sha256", password).update("algset-timer-session-v1").digest("hex");
}

export function checkPassword(password: string): boolean {
  const expected = Buffer.from(process.env.APP_PASSWORD || "");
  const given = Buffer.from(password || "");
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

export function isAuthed(req: VercelRequest): boolean {
  if (!authRequired()) return true;
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const expected = sessionToken();
  const given = Buffer.from(token);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

/** Returns true when the request may proceed; otherwise responds 401. */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}
