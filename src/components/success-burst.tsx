"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Animated check mark for success states. */
export function SuccessBurst({ title, subtitle }: { title: string; subtitle?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-forest p-5 text-white">
      <svg viewBox="0 0 52 52" className="size-12 shrink-0" aria-hidden>
        <motion.circle cx="26" cy="26" r="24" fill="none" stroke="var(--amber)" strokeWidth="3" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
        <motion.path d="M15 27l7 7 15-16" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: reduce ? 0 : 0.5 }} />
      </svg>
      <div>
        <div className="font-display text-lg font-bold">{title}</div>
        {subtitle && <div className="text-sm text-white/75">{subtitle}</div>}
      </div>
    </div>
  );
}
