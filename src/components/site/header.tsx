import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { ROLE_HOME } from "@/server/auth/permissions";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";

export const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/shop", label: "Shop pre-loved" },
  { href: "/sustainability", label: "Sustainability" },
  { href: "/b2b", label: "For business" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const home = user ? ROLE_HOME[user.role] : null;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="ReWear home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-charcoal/80 transition-colors hover:bg-cream-200 hover:text-charcoal">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
              <Link href={home!}>My dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href="/app/sell">Start selling</Link>
          </Button>
          <MobileMenu signedIn={!!user} home={home} />
        </div>
      </div>
    </header>
  );
}
