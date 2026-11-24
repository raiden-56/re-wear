import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { InstallButton } from "@/components/pwa/install-button";
import { logoutAction } from "@/app/actions/auth";
import { roleLabel } from "@/lib/labels";
import { initials } from "@/lib/utils";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { NavLink, MobileNavLink } from "./nav-link";

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

export async function AppShell({ user, nav, mobileNav, portal, children }: { user: SessionUser; nav: NavItem[]; mobileNav?: NavItem[]; portal: string; children: React.ReactNode }) {
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null, channel: "IN_APP" } });
  const bottom = (mobileNav ?? nav).slice(0, 5);
  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="ReWear home"><Logo /></Link>
        </div>
        <div className="px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-sage">{portal}</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label={portal}>
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.exact} icon={n.icon}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-forest-50 text-sm font-semibold text-forest">{initials(user.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.name ?? user.phone}</div>
              <div className="text-xs text-muted">{roleLabel[user.role]}</div>
            </div>
            <form action={logoutAction}>
              <button type="submit" aria-label="Sign out" className="rounded-lg p-2 text-muted hover:bg-cream hover:text-charcoal"><LogOut className="size-4" /></button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-cream/90 px-4 backdrop-blur lg:h-16 lg:px-8">
          <Link href="/" className="lg:hidden" aria-label="ReWear home"><Logo /></Link>
          <div className="hidden text-sm text-muted lg:block">{portal}</div>
          <div className="flex items-center gap-1.5">
            <InstallButton variant="ghost" className="hidden sm:inline-flex" />
            <Link href="/notifications" className="relative rounded-full p-2.5 hover:bg-cream-200" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <Bell className="size-5" />
              {unread > 0 && <span className="num absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
            <form action={logoutAction} className="lg:hidden">
              <button type="submit" aria-label="Sign out" className="rounded-full p-2.5 hover:bg-cream-200"><LogOut className="size-5" /></button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white/95 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }} aria-label="Primary">
          {bottom.map((n) => (
            <MobileNavLink key={n.href} href={n.href} exact={n.exact} icon={n.icon}>{n.label}</MobileNavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
