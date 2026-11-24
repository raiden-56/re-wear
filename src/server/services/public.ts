import { db } from "../db";

/** Aggregates shown on the public website — computed from real records. */
export async function publicStats() {
  const [weighed, paid, completed, customers, products] = await Promise.all([
    db.$queryRaw<{ grams: bigint }[]>`
      SELECT COALESCE(SUM(w."netGrams" - w."rejectedGrams"), 0)::bigint AS grams FROM "Booking" b
      JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
      WHERE b.status = 'COMPLETED'`,
    db.payout.aggregate({ where: { status: "SUCCESSFUL" }, _sum: { amountPaise: true } }),
    db.booking.count({ where: { status: "COMPLETED" } }),
    db.user.count({ where: { role: { key: "CUSTOMER" }, deletedAt: null } }),
    db.marketplaceProduct.findMany({ where: { status: "PUBLISHED", deletedAt: null }, orderBy: { publishedAt: "desc" }, take: 4, include: { category: true } }),
  ]);
  return { kg: Number(weighed[0]?.grams ?? 0) / 1000, paidPaise: paid._sum.amountPaise ?? 0, completed, customers, products };
}

export async function activeCities() {
  const areas = await db.serviceArea.findMany({ where: { active: true }, select: { city: true, zone: true, pincodes: true } });
  const cities = new Map<string, { zones: string[]; pincodes: number }>();
  for (const a of areas) {
    const c = cities.get(a.city) ?? { zones: [], pincodes: 0 };
    c.zones.push(a.zone);
    c.pincodes += a.pincodes.length;
    cities.set(a.city, c);
  }
  return [...cities.entries()].map(([city, v]) => ({ city, ...v }));
}
