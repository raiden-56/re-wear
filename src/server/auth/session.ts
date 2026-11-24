import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { randomToken, sha256 } from "../domain/codes";
import { AppError } from "../domain/errors";
import { hasPermission, ROLE_HOME, type Permission, type RoleKey } from "./permissions";

export const SESSION_COOKIE = "rw_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: RoleKey;
  status: string;
};

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, userAgent: h.get("user-agent")?.slice(0, 300), ip: await clientIp() },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

/** Current user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.status !== "ACTIVE" || u.deletedAt) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 15 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role.key as RoleKey, status: u.status };
});

/** For pages: redirect to login when signed out, or to the user's own portal when the role doesn't fit. */
export async function requireRole(roles: RoleKey[], next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/** For actions / route handlers: throw instead of redirecting. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
  return user;
}
