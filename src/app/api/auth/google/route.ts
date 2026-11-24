import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { randomToken } from "@/server/domain/codes";

/** Start Google OAuth (OpenID Connect, authorization code flow with state + nonce). */
export async function GET(req: NextRequest) {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID) return NextResponse.redirect(new URL("/login?error=Google+sign-in+is+not+configured", req.url));
  const state = randomToken(16);
  const nonce = randomToken(16);
  const next = req.nextUrl.searchParams.get("next") ?? "";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: e.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("rw_oauth", JSON.stringify({ state, nonce, next }), opts);
  return res;
}
