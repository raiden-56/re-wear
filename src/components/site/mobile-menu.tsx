"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guidelines", label: "What we accept" },
  { href: "/shop", label: "Shop pre-loved" },
  { href: "/sustainability", label: "Sustainability" },
  { href: "/b2b", label: "For business" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function MobileMenu({ signedIn, home }: { signedIn: boolean; home: string | null }) {
  const [open, setOpen] = React.useState(false);
  const path = usePathname();
  React.useEffect(() => setOpen(false), [path]);
  return (
    <>
      <Button variant="ghost" size="iconSm" className="lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Menu className="!size-5" />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 bg-charcoal/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.nav
              aria-label="Mobile"
              className="absolute right-0 top-0 flex h-full w-[82%] max-w-sm flex-col bg-cream p-6"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex justify-end">
                <Button variant="ghost" size="iconSm" aria-label="Close menu" onClick={() => setOpen(false)}>
                  <X className="!size-5" />
                </Button>
              </div>
              <ul className="space-y-1">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="block rounded-xl px-3 py-3 font-display text-lg font-semibold hover:bg-cream-200">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-auto grid gap-2">
                <Button asChild size="lg">
                  <Link href="/app/sell">Start selling</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href={signedIn && home ? home : "/login"}>{signedIn ? "My dashboard" : "Sign in"}</Link>
                </Button>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
