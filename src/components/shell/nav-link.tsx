"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function useActive(href: string, exact?: boolean) {
  const path = usePathname();
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

export function NavLink({ href, exact, icon, children }: { href: string; exact?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  const active = useActive(href, exact);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors [&_svg]:size-[18px]", active ? "text-forest" : "text-charcoal/75 hover:bg-cream hover:text-charcoal")}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 -z-0 rounded-xl bg-forest-50" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
      <span className="relative z-10 flex items-center gap-3">{icon}{children}</span>
    </Link>
  );
}

export function MobileNavLink({ href, exact, icon, children }: { href: string; exact?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  const active = useActive(href, exact);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium [&_svg]:size-5", active ? "text-forest" : "text-muted")}>
      <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-forest-50")}>{icon}</span>
      {children}
    </Link>
  );
}
