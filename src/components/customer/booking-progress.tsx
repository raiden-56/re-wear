"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "SCHEDULED", label: "Booked" },
  { key: "ASSIGNED", label: "Collector assigned" },
  { key: "EN_ROUTE", label: "On the way" },
  { key: "IN_PROGRESS", label: "Weighing" },
  { key: "AWAITING_APPROVAL", label: "Your approval" },
  { key: "COMPLETED", label: "Picked up" },
];
const ORDER: Record<string, number> = { SCHEDULED: 0, ASSIGNED: 1, EN_ROUTE: 2, IN_PROGRESS: 3, AWAITING_APPROVAL: 4, APPROVED: 4.5, COMPLETED: 5 };

/** Animated pickup progress tracker. */
export function BookingProgress({ status, compact }: { status: string; compact?: boolean }) {
  const reduce = useReducedMotion();
  const idx = ORDER[status];
  if (idx === undefined) return null;
  const pct = Math.min(100, (idx / (STAGES.length - 1)) * 100);
  return (
    <div className={cn("w-full", compact ? "mt-3" : "mt-2")}>
      <div className="relative h-1.5 rounded-full bg-cream-200">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-forest" initial={{ width: reduce ? `${pct}%` : 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      {!compact && (
        <ol className="mt-3 grid grid-cols-6 gap-1 text-center">
          {STAGES.map((s, i) => {
            const done = idx >= i;
            const current = Math.floor(idx) === i && idx < 5;
            return (
              <li key={s.key} className="flex flex-col items-center gap-1.5">
                <span className={cn("grid size-6 place-items-center rounded-full border-2 text-[10px] font-bold transition-colors", done ? "border-forest bg-forest text-white" : "border-line bg-white text-muted", current && "ring-4 ring-forest/15")}>
                  {done && !current ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={cn("text-[11px] leading-tight", done ? "font-medium text-charcoal" : "text-muted")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
