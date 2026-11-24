import { db } from "../db";
import { dayToDate, todayIST } from "@/lib/dates";

export async function collectorProfileFor(userId: string) {
  return db.collectorProfile.findUnique({ where: { userId }, include: { serviceArea: true } });
}

export async function collectorDay(collectorId: string, day = todayIST()) {
  const date = dayToDate(day);
  const bookings = await db.booking.findMany({
    where: { pickupDate: date, assignments: { some: { collectorId } } },
    include: { slot: true, address: true, customer: { select: { name: true } }, items: { include: { category: true } }, weighings: { orderBy: { createdAt: "desc" }, take: 1 }, assignments: { where: { collectorId }, orderBy: { assignedAt: "desc" }, take: 1 } },
    orderBy: [{ slot: { startTime: "asc" } }],
  });
  // Only bookings still actively assigned, plus ones this collector finished/failed.
  const mine = bookings.filter((b) => b.assignments[0]?.active || ["COMPLETED", "FAILED"].includes(b.status));
  const kpi = {
    assigned: mine.length,
    completed: mine.filter((b) => b.status === "COMPLETED").length,
    failed: mine.filter((b) => b.status === "FAILED").length,
    pending: mine.filter((b) => !["COMPLETED", "FAILED", "CANCELLED", "RETURNED"].includes(b.status)).length,
    grams: mine.filter((b) => b.status === "COMPLETED").reduce((s, b) => s + (b.weighings[0] ? b.weighings[0].netGrams - b.weighings[0].rejectedGrams : 0), 0),
  };
  return { bookings: mine, kpi };
}
