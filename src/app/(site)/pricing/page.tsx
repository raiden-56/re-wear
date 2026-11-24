import Link from "next/link";
import { Truck } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { EarningsCalculator } from "@/components/site/earnings-calculator";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { db } from "@/server/db";
import { rateCard } from "@/server/services/pricing";

export const metadata = { title: "Today's rates" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  const cities = (await db.serviceArea.findMany({ where: { active: true }, distinct: ["city"], select: { city: true } })).map((c) => c.city);
  const selected = city && cities.includes(city) ? city : null;
  const [kg, premium, recycle] = await Promise.all([rateCard("KG_BUYBACK", null, selected), rateCard("PREMIUM_RESALE", null, selected), rateCard("RECYCLING", null, selected)]);
  const updated = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  return (
    <>
      <PageHero eyebrow="Pricing" title="Today's rates, per kilogram." intro={`Live rates from our pricing engine, updated ${updated}. Your booking locks the rates in force when you confirm — future changes never affect it.`} />
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">City:</span>
          <Link href="/pricing" className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${!selected ? "bg-forest text-white" : "bg-white ring-1 ring-line"}`}>All cities</Link>
          {cities.map((c) => (
            <Link key={c} href={`/pricing?city=${encodeURIComponent(c)}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${selected === c ? "bg-forest text-white" : "bg-white ring-1 ring-line"}`}>{c}</Link>
          ))}
        </div>
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-3xl border border-line bg-white">
            <table className="w-full text-left">
              <thead className="bg-cream/70 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 text-right font-semibold">Quick Sell</th>
                  <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Premium resale</th>
                  <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Recycling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {kg.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3.5"><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.description}</div></td>
                    <td className="num px-5 py-3.5 text-right font-display text-lg font-bold">{r.ratePaisePerKg !== null ? formatINR(r.ratePaisePerKg) : "—"}</td>
                    <td className="num hidden px-5 py-3.5 text-right sm:table-cell">{premium[i]?.ratePaisePerKg ? formatINR(premium[i].ratePaisePerKg) : "—"}</td>
                    <td className="num hidden px-5 py-3.5 text-right sm:table-cell">{recycle[i]?.ratePaisePerKg ? formatINR(recycle[i].ratePaisePerKg) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 border-t border-line bg-forest-50 px-5 py-3 text-sm font-medium text-forest"><Truck className="size-4" /> Pickup fee: ₹0 — always free, never deducted.</div>
          </div>
          <div className="space-y-6">
            <EarningsCalculator rates={kg.map((r) => ({ id: r.id, slug: r.slug, name: r.name, ratePaisePerKg: r.ratePaisePerKg }))} />
            <div className="rounded-3xl border border-line bg-white p-6 text-sm leading-relaxed text-muted">
              <h3 className="font-semibold text-charcoal">How final earnings are calculated</h3>
              <p className="mt-2">Final earnings = net weight per category × that category's rate (locked at booking). Rejected items are weighed separately and not paid. Premium-resale rates apply only to items that pass our premium inspection.</p>
              <Button asChild variant="link" className="mt-2"><Link href="/guidelines">What we accept →</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
