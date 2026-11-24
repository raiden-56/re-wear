import { History } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { bookingStatus, channelLabel } from "@/lib/labels";
import { formatDay, formatKg } from "@/lib/utils";

export const metadata = { title: "Collection history" };

export default async function CollectorHistory() {
  const user = await requireRole(["COLLECTOR"]);
  const profile = await db.collectorProfile.findUnique({ where: { userId: user.id } });
  const bookings = profile
    ? await db.booking.findMany({
        where: { status: { in: ["COMPLETED", "FAILED", "RETURNED"] }, assignments: { some: { collectorId: profile.id } } },
        include: { slot: true, address: true, weighings: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { pickupDate: "desc" },
        take: 100,
      })
    : [];
  const done = bookings.filter((b) => b.status === "COMPLETED");
  const grams = done.reduce((s, b) => s + (b.weighings[0] ? b.weighings[0].netGrams - b.weighings[0].rejectedGrams : 0), 0);
  return (
    <>
      <PageHeader title="Collection history" description="Your last 100 pickups. Weights are as recorded at the doorstep." />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Completed" value={done.length} tone="forest" />
        <Stat label="KG collected" value={formatKg(grams, 0)} />
        <Stat label="Completion rate" value={`${bookings.length ? Math.round((done.length / bookings.length) * 100) : 0}%`} />
      </div>
      {bookings.length === 0 ? <EmptyState icon={History} title="No history yet" /> : (
        <Card>
          <Table>
            <thead><tr><Th>Date</Th><Th>Booking</Th><Th>Area</Th><Th className="text-right">Net</Th><Th>Status</Th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}><Td>{formatDay(b.pickupDate)}</Td><Td><div className="num font-medium">{b.code}</div><div className="text-xs text-muted">{channelLabel[b.channel]}</div></Td><Td className="text-muted">{b.address.pincode}</Td><Td className="num text-right">{b.weighings[0] ? formatKg(b.weighings[0].netGrams) : "—"}</Td><Td><StatusBadge map={bookingStatus} value={b.status} /></Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
