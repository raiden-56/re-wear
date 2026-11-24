import Link from "next/link";
import { PackagePlus, Truck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatusBadge, Tabs } from "@/components/ui/primitives";
import { bookingStatus, channelLabel } from "@/lib/labels";
import { formatDay, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "My pickups" };

const UPCOMING = ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED", "DISPUTED"] as const;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole(["CUSTOMER"]);
  const tab = (await searchParams).tab === "past" ? "past" : "upcoming";
  const where = tab === "upcoming" ? { customerId: user.id, status: { in: [...UPCOMING] } } : { customerId: user.id, status: { notIn: [...UPCOMING] } };
  const [bookings, upCount, pastCount] = await Promise.all([
    db.booking.findMany({ where, include: { slot: true, payout: true, valuations: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } }, orderBy: { pickupDate: tab === "upcoming" ? "asc" : "desc" }, take: 100 }),
    db.booking.count({ where: { customerId: user.id, status: { in: [...UPCOMING] } } }),
    db.booking.count({ where: { customerId: user.id, status: { notIn: [...UPCOMING] } } }),
  ]);
  return (
    <>
      <PageHeader title="My pickups" description="Track, reschedule and review every pickup." actions={<Button asChild><Link href="/app/sell"><PackagePlus /> New pickup</Link></Button>} />
      <Tabs items={[{ href: "/app/bookings", label: "Upcoming", count: upCount }, { href: "/app/bookings?tab=past", label: "History", count: pastCount }]} active={tab === "past" ? "/app/bookings?tab=past" : "/app/bookings"} />
      {bookings.length === 0 ? (
        <EmptyState icon={Truck} title={tab === "upcoming" ? "No upcoming pickups" : "No past pickups yet"} action={<Button asChild><Link href="/app/sell">Book a free pickup</Link></Button>} />
      ) : (
        <div className="grid gap-3">
          {bookings.map((b) => (
            <Link key={b.id} href={`/app/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 transition-colors hover:border-charcoal/25">
              <div>
                <div className="font-semibold">{formatDay(b.pickupDate)} · {b.slot.label}</div>
                <div className="text-sm text-muted">{b.code} · {channelLabel[b.channel]}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="num text-right text-sm">
                  <div className="font-semibold">{b.valuations[0] ? formatINR(b.valuations[0].payablePaise) : b.channel === "DONATION" ? "Donation" : `~${formatINR(b.estimatedPaise, { whole: true })}`}</div>
                  <div className="text-xs text-muted">{b.valuations[0] ? formatKg(b.valuations[0].netGrams) : `~${formatKg(b.estimatedGrams, 0)}`}</div>
                </div>
                <StatusBadge map={bookingStatus} value={b.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
