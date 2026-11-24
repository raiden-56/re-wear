import { NextResponse, type NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/server/env";
import { createSession } from "@/server/auth/session";
import { upsertUserByGoogle } from "@/server/services/accounts";
import { ROLE_HOME, canAccessPortal, type RoleKey } from "@/server/auth/permissions";
import { isAppError } from "@/server/domain/errors";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function GET(req: NextRequest) {
  const e = env();
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url));
  try {
    const raw = req.cookies.get("rw_oauth")?.value;
    const saved = raw ? (JSON.parse(raw) as { state: string; nonce: string; next: string }) : null;
    const code = req.nextUrl.searchParams.get("code");
    if (!saved || !code || req.nextUrl.searchParams.get("state") !== saved.state) return fail("Sign-in expired. Please try again.");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: e.GOOGLE_CLIENT_ID!, client_secret: e.GOOGLE_CLIENT_SECRET!, redirect_uri: `${e.APP_URL}/api/auth/google/callback`, grant_type: "authorization_code" }),
    });
    if (!tokenRes.ok) return fail("Google sign-in failed.");
    const { id_token } = (await tokenRes.json()) as { id_token: string };
    const { payload } = await jwtVerify(id_token, JWKS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: e.GOOGLE_CLIENT_ID });
    if (payload.nonce !== saved.nonce) return fail("Sign-in could not be verified.");

    const { user, isNew } = await upsertUserByGoogle({
      sub: String(payload.sub),
      email: String(payload.email),
      name: payload.name as string | undefined,
      picture: payload.picture as string | undefined,
      emailVerified: payload.email_verified === true,
    });
    await createSession(user.id);
    const role = user.role.key as RoleKey;
    const next = saved.next && saved.next.startsWith("/") && !saved.next.startsWith("//") && canAccessPortal(role, saved.next) ? saved.next : ROLE_HOME[role];
    const res = NextResponse.redirect(new URL(isNew ? `/onboarding?next=${encodeURIComponent(next)}` : next, req.url));
    res.cookies.delete("rw_oauth");
    return res;
  } catch (err) {
    return fail(isAppError(err) ? err.message : "Google sign-in failed.");
  }
}
