import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { addDays, dayToDate, todayIST } from "@/lib/dates";
import { bookingStatus } from "@/lib/labels";
import { formatDay, formatKg } from "@/lib/utils";

export const metadata = { title: "Calendar" };

export default async function CollectorCalendar() {
  const user = await requireRole(["COLLECTOR"]);
  const today = todayIST();
  const bookings = await db.booking.findMany({
    where: { pickupDate: { gte: dayToDate(today), lte: dayToDate(addDays(today, 13)) }, assignments: { some: { active: true, collector: { userId: user.id } } }, status: { notIn: ["CANCELLED"] } },
    include: { slot: true, address: true },
    orderBy: [{ pickupDate: "asc" }, { slot: { startTime: "asc" } }],
  });
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  return (
    <>
      <PageHeader title="Pickup calendar" description="Your assignments for the next two weeks." />
      {bookings.length === 0 ? <EmptyState icon={CalendarDays} title="No upcoming assignments" /> : (
        <div className="space-y-5">
          {days.map((d) => {
            const list = bookings.filter((b) => b.pickupDate.toISOString().slice(0, 10) === d);
            if (!list.length) return null;
            return (
              <section key={d}>
                <h2 className="mb-2 text-sm font-semibold">{formatDay(dayToDate(d))} <span className="text-muted">· {list.length} pickup{list.length > 1 ? "s" : ""}</span></h2>
                <ul className="space-y-2">
                  {list.map((b) => (
                    <li key={b.id}><Link href={`/collector/pickups/${b.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 text-sm"><span><span className="font-medium">{b.slot.label}</span> · {b.address.line1.slice(0, 40)} · ~{formatKg(b.estimatedGrams, 0)}</span><StatusBadge map={bookingStatus} value={b.status} /></Link></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
