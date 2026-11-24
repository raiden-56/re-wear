import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarClock, Clock, IndianRupee, Leaf, PackagePlus, Scale, Truck, Wallet } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { impactFromGrams } from "@/server/services/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Notice, Stat, StatusBadge } from "@/components/ui/primitives";
import { BookingProgress } from "@/components/customer/booking-progress";
import { CountUp } from "@/components/motion";
import { bookingStatus, channelLabel, payoutStatus } from "@/lib/labels";
import { images } from "@/lib/images";
import { formatDate, formatDay, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "My ReWear" };

export default async function CustomerHome() {
  const user = await requireRole(["CUSTOMER"]);
  const [completed, upcoming, awaiting, payouts, upiCount, weighed] = await Promise.all([
    db.booking.count({ where: { customerId: user.id, status: "COMPLETED" } }),
    db.booking.findMany({ where: { customerId: user.id, status: { in: ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "APPROVED"] } }, include: { slot: true, assignments: { where: { active: true }, include: { collector: { include: { user: true } } } } }, orderBy: { pickupDate: "asc" }, take: 3 }),
    db.booking.findMany({ where: { customerId: user.id, status: "AWAITING_APPROVAL" }, include: { valuations: { where: { status: "PENDING" }, orderBy: { version: "desc" }, take: 1 } } }),
    db.payout.findMany({ where: { customerId: user.id }, include: { booking: true }, orderBy: { createdAt: "desc" } }),
    db.upiAccount.count({ where: { userId: user.id, deletedAt: null, verified: true } }),
    db.$queryRaw<{ grams: bigint }[]>`
      SELECT COALESCE(SUM(w."netGrams" - w."rejectedGrams"), 0)::bigint AS grams FROM "Booking" b
      JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
      WHERE b."customerId" = ${user.id} AND b.status = 'COMPLETED'`,
  ]);
  const grams = Number(weighed[0]?.grams ?? 0);
  const earned = payouts.filter((p) => p.status === "SUCCESSFUL").reduce((s, p) => s + p.amountPaise, 0);
  const pending = payouts.filter((p) => !["SUCCESSFUL", "REVERSED"].includes(p.status));
  const pendingAmount = pending.reduce((s, p) => s + p.amountPaise, 0);
  const impact = impactFromGrams(grams);
  const first = user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Namaste, {first}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Your wardrobe, turned into value.</h1>
        </div>
        <Button asChild size="lg"><Link href="/app/sell"><PackagePlus /> Quick sell</Link></Button>
      </div>

      {awaiting.map((b) => (
        <Link key={b.id} href={`/app/bookings/${b.id}`} className="block rounded-2xl border-2 border-amber bg-amber-100 p-4 transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-[#7a5317]" />
              <div>
                <div className="font-semibold">Approve your valuation for {b.code}</div>
                <div className="text-sm text-charcoal/70">{b.valuations[0] ? `${formatKg(b.valuations[0].netGrams)} weighed · ${formatINR(b.valuations[0].payablePaise)} payable` : "Waiting for weighing"}</div>
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0" />
          </div>
        </Link>
      ))}

      {upiCount === 0 && (
        <Notice tone="warn" title="Add your UPI ID to get paid">
          Payments go straight to your bank via UPI. <Link href="/app/payments" className="font-semibold underline">Add UPI ID →</Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total KG sold" value={<CountUp value={grams / 1000} decimals={1} suffix=" kg" />} icon={Scale} tone="forest" />
        <Stat label="Total earnings" value={formatINR(earned, { whole: true })} icon={IndianRupee} hint="Paid to your UPI" />
        <Stat label="Completed pickups" value={completed} icon={Truck} hint={`${upcoming.length} upcoming`} />
        <Stat label="Pending payments" value={formatINR(pendingAmount, { whole: true })} icon={Wallet} hint={`${pending.length} in progress`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Upcoming pickups" action={<Link href="/app/bookings" className="text-sm font-medium text-forest">All pickups</Link>} />
          <div className="divide-y divide-line">
            {upcoming.length === 0 && (
              <div className="p-5">
                <EmptyState icon={CalendarClock} title="No pickups scheduled" description="Book a free pickup in under two minutes." action={<Button asChild><Link href="/app/sell">Book free pickup</Link></Button>} />
              </div>
            )}
            {upcoming.map((b) => (
              <Link key={b.id} href={`/app/bookings/${b.id}`} className="block px-5 py-4 hover:bg-cream/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{formatDay(b.pickupDate)} · {b.slot.label}</div>
                    <div className="mt-0.5 text-sm text-muted">{b.code} · {channelLabel[b.channel]} · ~{formatKg(b.estimatedGrams, 0)}</div>
                    {b.assignments[0] && <div className="mt-1 text-xs text-muted">Collector: {b.assignments[0].collector.user.name}</div>}
                  </div>
                  <StatusBadge map={bookingStatus} value={b.status} />
                </div>
                <BookingProgress status={b.status} compact />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="relative h-32">
            <Image src={images.cottonBolls} alt="" fill sizes="400px" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-700/90 to-forest-700/20" />
            <div className="absolute bottom-3 left-5 flex items-center gap-2 font-semibold text-white"><Leaf className="size-4 text-amber" /> Your environmental impact</div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line p-2 text-center">
            <div className="p-3"><div className="num font-display text-xl font-bold">{impact.kg.toFixed(1)}</div><div className="text-xs text-muted">kg diverted</div></div>
            <div className="p-3"><div className="num font-display text-xl font-bold">{Math.round(impact.co2Kg)}</div><div className="text-xs text-muted">kg CO₂e saved</div></div>
            <div className="p-3"><div className="num font-display text-xl font-bold">{impact.garmentsReused}</div><div className="text-xs text-muted">garments reused</div></div>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">Estimates based on accepted net weight. <Link href="/sustainability" className="underline">Method</Link></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent transactions" action={<Link href="/app/payments" className="text-sm font-medium text-forest">All payments</Link>} />
        <div className="divide-y divide-line">
          {payouts.length === 0 && <p className="px-5 py-6 text-sm text-muted">Your UPI payouts will appear here after your first pickup.</p>}
          {payouts.slice(0, 5).map((p) => (
            <Link key={p.id} href={`/app/payments#${p.code}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-cream/50">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-forest-50"><IndianRupee className="size-4 text-forest" /></span>
                <div>
                  <div className="text-sm font-medium">Payout for {p.booking.code}</div>
                  <div className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3" /> {formatDate(p.completedAt ?? p.createdAt, true)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="num font-semibold">{formatINR(p.amountPaise)}</div>
                <StatusBadge map={payoutStatus} value={p.status} />
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
