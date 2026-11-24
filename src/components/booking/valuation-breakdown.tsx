import { formatINR, formatKg } from "@/lib/utils";

type Line = { categoryId: string; name: string; grams: number; ratePaisePerKg: number; subtotalPaise: number };
type Deduction = { reason: string; amountPaise: number };

/** Full transparent valuation statement: gross → tare → net → category lines → deductions → payable. */
export function ValuationBreakdown({ v, rejectedGrams = 0 }: { v: { version: number; grossGrams: number; tareGrams: number; netGrams: number; lines: unknown; deductions: unknown; subtotalPaise: number; deductionPaise: number; payablePaise: number; source: string }; rejectedGrams?: number }) {
  const lines = v.lines as Line[];
  const deductions = (v.deductions as Deduction[]) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-cream p-3"><div className="text-xs text-muted">Gross weight</div><div className="num mt-1 font-display text-lg font-bold">{formatKg(v.grossGrams)}</div></div>
        <div className="rounded-2xl bg-cream p-3"><div className="text-xs text-muted">Container tare</div><div className="num mt-1 font-display text-lg font-bold">− {formatKg(v.tareGrams)}</div></div>
        <div className="rounded-2xl bg-forest p-3 text-white"><div className="text-xs text-white/70">Net weight</div><div className="num mt-1 font-display text-lg font-bold">{formatKg(v.netGrams)}</div></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line"><th className="py-2 pr-2">Category</th><th className="py-2 text-right">Weight</th><th className="py-2 text-right">Price / kg</th><th className="py-2 text-right">Subtotal</th></tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {lines.map((l) => (
              <tr key={l.categoryId}><td className="py-2.5 pr-2 font-medium">{l.name}</td><td className="num py-2.5 text-right">{formatKg(l.grams)}</td><td className="num py-2.5 text-right">{formatINR(l.ratePaisePerKg)}</td><td className="num py-2.5 text-right font-medium">{formatINR(l.subtotalPaise)}</td></tr>
            ))}
            {rejectedGrams > 0 && <tr className="text-muted"><td className="py-2.5 pr-2">Not accepted (weighed separately)</td><td className="num py-2.5 text-right">{formatKg(rejectedGrams)}</td><td className="num py-2.5 text-right">₹0</td><td className="num py-2.5 text-right">₹0</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-line">
            <tr><td colSpan={3} className="py-2.5 text-muted">Subtotal</td><td className="num py-2.5 text-right font-medium">{formatINR(v.subtotalPaise)}</td></tr>
            {deductions.map((d, i) => <tr key={i}><td colSpan={3} className="py-1.5 text-muted">Deduction — {d.reason}</td><td className="num py-1.5 text-right text-danger">− {formatINR(d.amountPaise)}</td></tr>)}
            <tr><td colSpan={3} className="py-1.5 text-forest">Pickup charge</td><td className="num py-1.5 text-right font-medium text-forest">₹0 (free)</td></tr>
            <tr className="text-base"><td colSpan={3} className="pt-3 font-semibold">Final payable amount</td><td className="num pt-3 text-right font-display text-2xl font-bold text-forest">{formatINR(v.payablePaise)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">Valuation version {v.version} · {v.source === "DOORSTEP" ? "weighed at your doorstep" : v.source === "WAREHOUSE_REINSPECTION" ? "revised after warehouse re-inspection" : "adjusted by ReWear"}.</p>
    </div>
  );
}
