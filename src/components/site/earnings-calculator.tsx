"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Info, Minus, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tween } from "@/components/motion";
import { cn } from "@/lib/utils";

type Rate = { id: string; slug: string; name: string; ratePaisePerKg: number | null };

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Illustrative calculator using the live server rate card. The binding estimate is
 * always recomputed server-side when a booking is confirmed.
 */
export function EarningsCalculator({ rates, compact }: { rates: Rate[]; compact?: boolean }) {
  const priced = rates.filter((r) => r.ratePaisePerKg !== null);
  const [selected, setSelected] = React.useState<string[]>(priced.slice(0, 3).map((r) => r.id));
  const [kg, setKg] = React.useState(10);
  const chosen = priced.filter((r) => selected.includes(r.id));
  const perCat = chosen.length ? (kg * 1000) / chosen.length : 0;
  const total = chosen.reduce((s, r) => s + Math.round((perCat * (r.ratePaisePerKg ?? 0)) / 1000), 0);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const fmt = React.useCallback((v: number) => inr(v), []);

  return (
    <div className={cn("rounded-[1.75rem] border border-line bg-white p-5 shadow-[0_30px_60px_-30px_rgba(23,75,55,0.25)] sm:p-7", compact && "shadow-none")}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Estimate your earnings</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 text-xs font-semibold text-forest">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-sage opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-forest" /></span>
          Live rates
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">Pick what you're clearing out.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Clothing categories">
        {priced.map((r) => {
          const on = selected.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.id)}
              className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all", on ? "border-forest bg-forest text-white" : "border-line bg-cream/50 text-charcoal hover:border-charcoal/30")}
            >
              {r.name} <span className={cn("num ml-1", on ? "text-amber" : "text-muted")}>{inr(r.ratePaisePerKg!)}/kg</span>
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        <div className="flex items-end justify-between">
          <label htmlFor="kg" className="text-sm font-medium">Approximate weight</label>
          <span className="num font-display text-2xl font-bold">{kg} kg</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button type="button" variant="secondary" size="iconSm" aria-label="Decrease weight" onClick={() => setKg((k) => Math.max(1, k - 1))}><Minus /></Button>
          <input id="kg" type="range" min={1} max={60} value={kg} onChange={(e) => setKg(Number(e.target.value))} className="h-2 flex-1 cursor-pointer accent-[var(--forest)]" />
          <Button type="button" variant="secondary" size="iconSm" aria-label="Increase weight" onClick={() => setKg((k) => Math.min(60, k + 1))}><Plus /></Button>
        </div>
        <p className="mt-2 text-xs text-muted">A full kitchen trash bag of clothes is roughly 5–7 kg.</p>
      </div>
      <div className="mt-6 flex items-end justify-between rounded-2xl bg-cream p-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Estimated earnings</div>
          <Tween value={total} format={fmt} className="num font-display text-4xl font-extrabold text-forest" />
        </div>
        <div className="text-right text-xs text-muted">
          <div className="inline-flex items-center gap-1 font-semibold text-forest"><Truck className="size-3.5" /> Pickup ₹0</div>
          <div>Paid to your UPI</div>
        </div>
      </div>
      <p className="mt-3 flex gap-1.5 text-xs leading-relaxed text-muted">
        <Info className="mt-px size-3.5 shrink-0" /> Final earnings depend on verified weight at your doorstep, inspection and the applicable category rates.
      </p>
      {!compact && (
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/app/sell">
            Book a free pickup <ArrowRight />
          </Link>
        </Button>
      )}
    </div>
  );
}
