import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: send signed-out visitors of role portals to the login page.
 * Real authorization (session validity, role, permissions) happens server-side in
 * every layout, server action and route handler.
 */
const PROTECTED = ["/notifications", "/app", "/collector", "/warehouse", "/admin", "/business", "/recycler", "/partner", "/onboarding", "/receipts"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isProtected && !req.cookies.has("rw_session")) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|sw.js|manifest.webmanifest|icon.png).*)"],
};
