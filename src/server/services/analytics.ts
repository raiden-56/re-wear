import { db } from "../db";

type Range = { from: Date; to: Date };

const sum = (rows: { _sum: { amountPaise: number | null } }) => rows._sum.amountPaise ?? 0;

async function ledgerBalance(account: string, range?: Range) {
  const where = { account: account as never, ...(range ? { createdAt: { gte: range.from, lt: range.to } } : {}) };
  const [d, c] = await Promise.all([
    db.financialLedger.aggregate({ where: { ...where, direction: "DEBIT" }, _sum: { amountPaise: true } }),
    db.financialLedger.aggregate({ where: { ...where, direction: "CREDIT" }, _sum: { amountPaise: true } }),
  ]);
  return { debit: sum(d), credit: sum(c) };
}

/** Accepted (net of rejected) grams from the latest weighing of each completed booking. */
async function collectedGramsSql(range?: Range) {
  const rows = await db.$queryRaw<{ grams: bigint | null; bookings: bigint }[]>`
    SELECT COALESCE(SUM(w."netGrams" - w."rejectedGrams"), 0)::bigint AS grams, COUNT(*)::bigint AS bookings
    FROM "Booking" b
    JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
    WHERE b.status = 'COMPLETED'
      AND (${range?.from ?? null}::timestamptz IS NULL OR b."completedAt" >= ${range?.from ?? null}::timestamptz)
      AND (${range?.to ?? null}::timestamptz IS NULL OR b."completedAt" < ${range?.to ?? null}::timestamptz)`;
  return { grams: Number(rows[0]?.grams ?? 0), bookings: Number(rows[0]?.bookings ?? 0) };
}

export async function adminKpis() {
  const [customers, totalPickups, completed, pending, collected, payoutsDone, payoutsPending, inv, mkt, b2b, recy, logistics, sorting, processing, refunds] = await Promise.all([
    db.user.count({ where: { role: { key: "CUSTOMER" }, deletedAt: null } }),
    db.booking.count({ where: { channel: { not: "DONATION" } } }),
    db.booking.count({ where: { status: "COMPLETED" } }),
    db.booking.count({ where: { status: { in: ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED"] } } }),
    collectedGramsSql(),
    db.payout.aggregate({ where: { status: "SUCCESSFUL" }, _sum: { amountPaise: true } }),
    db.payout.aggregate({ where: { status: { in: ["AWAITING_APPROVAL", "APPROVED", "INITIATED", "PROCESSING", "UNDER_REVIEW", "FAILED"] } }, _sum: { amountPaise: true }, _count: true }),
    db.inventoryItem.groupBy({ by: ["grade"], where: { status: { in: ["IN_STOCK", "LISTED", "RESERVED"] } }, _sum: { weightGrams: true } }),
    ledgerBalance("MARKETPLACE_REVENUE"),
    ledgerBalance("B2B_REVENUE"),
    ledgerBalance("RECYCLING_REVENUE"),
    ledgerBalance("LOGISTICS_COST"),
    ledgerBalance("SORTING_COST"),
    ledgerBalance("PROCESSING_COST"),
    ledgerBalance("REFUNDS"),
  ]);
  const gradeGrams = (g: string[]) => inv.filter((i) => g.includes(i.grade)).reduce((s, i) => s + (i._sum.weightGrams ?? 0), 0);
  const revenue = mkt.credit - mkt.debit + (b2b.credit - b2b.debit) + (recy.credit - recy.debit) - (refunds.debit - refunds.credit);
  const payoutCost = payoutsDone._sum.amountPaise ?? 0;
  const operatingCosts = logistics.debit + sorting.debit + processing.debit;
  const allBookings = await db.booking.count();
  return {
    customers,
    totalPickups,
    completedPickups: completed,
    pendingPickups: pending,
    freePickups: allBookings, // every pickup is free — fee is always zero
    collectedGrams: collected.grams,
    avgGramsPerBooking: collected.bookings ? Math.round(collected.grams / collected.bookings) : 0,
    payoutsPaid: payoutCost,
    payoutsPending: payoutsPending._sum.amountPaise ?? 0,
    payoutsPendingCount: payoutsPending._count,
    reusableGrams: gradeGrams(["STANDARD_REUSABLE", "REPAIRABLE"]),
    recyclingGrams: gradeGrams(["RECYCLABLE", "UPCYCLING"]),
    premiumGrams: gradeGrams(["PREMIUM_REUSABLE"]),
    unsortedGrams: gradeGrams(["UNSORTED"]),
    b2bRevenue: b2b.credit - b2b.debit,
    marketplaceRevenue: mkt.credit - mkt.debit,
    recyclingRevenue: recy.credit - recy.debit,
    revenue,
    operatingCosts,
    grossContribution: revenue - payoutCost - operatingCosts,
  };
}

export async function collectionSeries(bucket: "day" | "week" | "month", periods: number) {
  const rows = await db.$queryRaw<{ bucket: Date; grams: bigint; bookings: bigint; payout: bigint }[]>`
    SELECT date_trunc(${bucket}, b."completedAt" AT TIME ZONE 'Asia/Kolkata') AS bucket,
           COALESCE(SUM(w."netGrams" - w."rejectedGrams"), 0)::bigint AS grams,
           COUNT(*)::bigint AS bookings,
           COALESCE(SUM(v."payablePaise"), 0)::bigint AS payout
    FROM "Booking" b
    JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
    LEFT JOIN LATERAL (SELECT * FROM "Valuation" va WHERE va."bookingId" = b.id AND va.status = 'APPROVED' ORDER BY va.version DESC LIMIT 1) v ON true
    WHERE b.status = 'COMPLETED' AND b."completedAt" >= now() - (${periods} || ' ' || ${bucket})::interval
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    label: r.bucket.toISOString().slice(0, bucket === "month" ? 7 : 10),
    kg: Number(r.grams) / 1000,
    bookings: Number(r.bookings),
    payout: Number(r.payout) / 100,
  }));
}

export async function revenueSeries(months = 6) {
  const rows = await db.$queryRaw<{ bucket: Date; account: string; amount: bigint }[]>`
    SELECT date_trunc('month', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS bucket, account::text AS account,
           SUM(CASE WHEN direction = 'CREDIT' THEN "amountPaise" ELSE -"amountPaise" END)::bigint AS amount
    FROM "FinancialLedger"
    WHERE account IN ('MARKETPLACE_REVENUE','B2B_REVENUE','RECYCLING_REVENUE') AND "createdAt" >= now() - (${months} || ' month')::interval
    GROUP BY 1, 2 ORDER BY 1`;
  const map = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const k = r.bucket.toISOString().slice(0, 7);
    const row = map.get(k) ?? { label: k, marketplace: 0, b2b: 0, recycling: 0 };
    const key = r.account === "MARKETPLACE_REVENUE" ? "marketplace" : r.account === "B2B_REVENUE" ? "b2b" : "recycling";
    row[key] = Number(r.amount) / 100;
    map.set(k, row);
  }
  return [...map.values()];
}

export async function categoryDistribution() {
  const rows = await db.$queryRaw<{ name: string; grams: bigint }[]>`
    SELECT c.name, SUM((cw->>'grams')::int)::bigint AS grams
    FROM "Booking" b
    JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
    CROSS JOIN LATERAL jsonb_array_elements(w."categoryWeights") cw
    JOIN "ClothingCategory" c ON c.id = cw->>'categoryId'
    WHERE b.status = 'COMPLETED'
    GROUP BY c.name ORDER BY grams DESC`;
  return rows.map((r) => ({ name: r.name, kg: Number(r.grams) / 1000 }));
}

export async function cityPerformance() {
  const rows = await db.$queryRaw<{ city: string; bookings: bigint; completed: bigint; grams: bigint }[]>`
    SELECT sa.city, COUNT(b.id)::bigint AS bookings,
      COUNT(b.id) FILTER (WHERE b.status = 'COMPLETED')::bigint AS completed,
      COALESCE(SUM(w."netGrams" - w."rejectedGrams") FILTER (WHERE b.status = 'COMPLETED'), 0)::bigint AS grams
    FROM "Booking" b JOIN "ServiceArea" sa ON sa.id = b."serviceAreaId"
    LEFT JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
    GROUP BY sa.city ORDER BY grams DESC`;
  return rows.map((r) => ({ city: r.city, bookings: Number(r.bookings), completed: Number(r.completed), kg: Number(r.grams) / 1000 }));
}

export async function collectorPerformance(range?: Range) {
  const rows = await db.$queryRaw<{ name: string; code: string; assigned: bigint; completed: bigint; failed: bigint; grams: bigint }[]>`
    SELECT u.name, cp."employeeCode" AS code,
      COUNT(DISTINCT pa."bookingId")::bigint AS assigned,
      COUNT(DISTINCT pa."bookingId") FILTER (WHERE b.status = 'COMPLETED')::bigint AS completed,
      COUNT(DISTINCT pa."bookingId") FILTER (WHERE b.status = 'FAILED')::bigint AS failed,
      COALESCE(SUM(w."netGrams" - w."rejectedGrams") FILTER (WHERE b.status = 'COMPLETED'), 0)::bigint AS grams
    FROM "CollectorProfile" cp JOIN "User" u ON u.id = cp."userId"
    LEFT JOIN "PickupAssignment" pa ON pa."collectorId" = cp.id
    LEFT JOIN "Booking" b ON b.id = pa."bookingId"
      AND (${range?.from ?? null}::timestamptz IS NULL OR b."pickupDate" >= ${range?.from ?? null}::date)
      AND (${range?.to ?? null}::timestamptz IS NULL OR b."pickupDate" < ${range?.to ?? null}::date)
    LEFT JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId" = b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true
    GROUP BY u.name, cp."employeeCode" ORDER BY grams DESC`;
  return rows.map((r) => ({ name: r.name ?? r.code, code: r.code, assigned: Number(r.assigned), completed: Number(r.completed), failed: Number(r.failed), kg: Number(r.grams) / 1000 }));
}

export async function inventoryDistribution() {
  const rows = await db.inventoryItem.groupBy({ by: ["grade"], where: { status: { in: ["IN_STOCK", "LISTED", "RESERVED"] } }, _sum: { weightGrams: true } });
  return rows.map((r) => ({ grade: r.grade, kg: (r._sum.weightGrams ?? 0) / 1000 }));
}

export async function b2bSalesSeries(months = 6) {
  const rows = await db.$queryRaw<{ bucket: Date; grams: bigint; amount: bigint }[]>`
    SELECT date_trunc('month', "confirmedAt") AS bucket, SUM("requestedGrams")::bigint AS grams, SUM("totalPaise")::bigint AS amount
    FROM "PurchaseOrder" WHERE status IN ('CONFIRMED','DISPATCHED','DELIVERED') AND "confirmedAt" >= now() - (${months} || ' month')::interval
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ label: r.bucket.toISOString().slice(0, 7), kg: Number(r.grams) / 1000, amount: Number(r.amount) / 100 }));
}

/** Customer environmental impact — conservative textile reuse factors. */
export function impactFromGrams(grams: number) {
  const kg = grams / 1000;
  return { kg, co2Kg: kg * 3.6, waterLitres: kg * 2700 * 0.25, garmentsReused: Math.round(kg * 3) };
}
