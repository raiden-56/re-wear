import Link from "next/link";
import { ArrowRight, BadgeCheck, FileText, Handshake, Scale, Truck } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { Button } from "@/components/ui/button";
import { businessTypeLabel, gradeLabel } from "@/lib/labels";
import { images } from "@/lib/images";
import { formatINR, formatKg } from "@/lib/utils";
import { db } from "@/server/db";

export const metadata = { title: "B2B partnerships" };

export default async function B2BPage() {
  const listings = await db.businessListing.findMany({ where: { active: true }, include: { category: true }, take: 6, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHero eyebrow="B2B partnerships" title="Graded, weighed, traceable textile supply." intro="Thrift stores, wholesalers, recyclers, upcyclers, garment manufacturers and NGOs buy sorted stock from ReWear by the kilogram — with grades, minimum orders and invoices." image={images.sweatersRack} imageAlt="Rows of colourful sweaters on hangers" />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [BadgeCheck, "Verified accounts", "GSTIN-checked businesses only. Pricing tiers per partner."],
            [Scale, "Graded by the KG", "Premium, standard reusable, repairable, recyclable, upcycling."],
            [Handshake, "Negotiate in-app", "Request, counter-offer and confirm with a clear audit trail."],
            [FileText, "Invoices & tracking", "Tax invoices, dispatch tracking and full transaction history."],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof Scale;
            return <div key={t as string} className="rounded-3xl border border-line bg-white p-6"><I className="size-6 text-forest" /><h3 className="mt-4 font-semibold">{t as string}</h3><p className="mt-1 text-sm text-muted">{d as string}</p></div>;
          })}
        </div>
        <h2 className="mt-16 text-3xl font-bold">Available now</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <div key={l.id} className="rounded-3xl border border-line bg-white p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-sage">{gradeLabel[l.grade]?.label}</div>
              <h3 className="mt-2 font-semibold">{l.title}</h3>
              <div className="mt-4 flex items-end justify-between">
                <div className="num font-display text-2xl font-bold">{formatINR(l.pricePerKgPaise)}<span className="text-sm font-medium text-muted">/kg</span></div>
                <div className="text-right text-xs text-muted"><div>{formatKg(l.availableGrams - l.reservedGrams, 0)} available</div><div>MOQ {formatKg(l.minOrderGrams, 0)}</div></div>
              </div>
              {l.allowedTypes.length > 0 && <p className="mt-3 text-xs text-muted">For: {l.allowedTypes.map((t) => businessTypeLabel[t]).join(", ")}</p>}
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start gap-4 rounded-3xl bg-forest p-8 text-white sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-2xl font-bold">Open a business account</h3><p className="mt-1 text-white/75">Sign in with your business mobile number, then submit your GSTIN for verification.</p></div>
          <div className="flex gap-2">
            <Button asChild variant="amber"><Link href="/partners/register?type=business">Register business <ArrowRight /></Link></Button>
            <Button asChild variant="outlineLight"><Link href="/partners/register?type=recycler"><Truck /> Recycler</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
