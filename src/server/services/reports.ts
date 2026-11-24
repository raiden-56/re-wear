import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { dayToDate, addDays } from "@/lib/dates";
import { collectorPerformance } from "./analytics";

export type ReportFilters = {
  from?: string; // YYYY-MM-DD
  to?: string; // inclusive
  city?: string;
  categoryId?: string;
  collectorId?: string;
  paymentStatus?: string;
};

export const REPORTS = {
  collections: "Total KG collected",
  payouts: "Customer payouts",
  revenue: "Revenue (ledger)",
  inventory: "Inventory",
  resale: "Premium resale orders",
  b2b: "B2B sales",
  recycling: "Recycling dispatches",
  donations: "Donations",
  collectors: "Collector performance",
  profitability: "Profitability",
  customers: "Customers",
} as const;

export type ReportKey = keyof typeof REPORTS;
type Row = Record<string, string | number | null>;

const range = (f: ReportFilters) => ({
  gte: f.from ? dayToDate(f.from) : undefined,
  lt: f.to ? dayToDate(addDays(f.to, 1)) : undefined,
});
const rupees = (p: number | null | undefined) => (p ?? 0) / 100;
const kg = (g: number | null | undefined) => (g ?? 0) / 1000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : null);

export async function buildReport(key: ReportKey, f: ReportFilters): Promise<Row[]> {
  const r = range(f);
  switch (key) {
    case "collections": {
      const where: Prisma.BookingWhereInput = {
        status: "COMPLETED",
        completedAt: r,
        ...(f.city ? { serviceArea: { city: f.city } } : {}),
        ...(f.collectorId ? { assignments: { some: { collectorId: f.collectorId, active: true } } } : {}),
        ...(f.categoryId ? { items: { some: { categoryId: f.categoryId } } } : {}),
      };
      const rows = await db.booking.findMany({
        where,
        include: { serviceArea: true, weighings: { orderBy: { createdAt: "desc" }, take: 1 }, valuations: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 }, customer: true, assignments: { where: { active: true }, include: { collector: { include: { user: true } } } } },
        orderBy: { completedAt: "desc" },
        take: 5000,
      });
      return rows.map((b) => ({
        booking: b.code,
        completed: iso(b.completedAt),
        city: b.serviceArea.city,
        zone: b.serviceArea.zone,
        channel: b.channel,
        customer: b.customer.name,
        collector: b.assignments[0]?.collector.user.name ?? null,
        gross_kg: kg(b.weighings[0]?.grossGrams),
        tare_kg: kg(b.weighings[0]?.tareGrams),
        net_kg: kg(b.weighings[0]?.netGrams),
        rejected_kg: kg(b.weighings[0]?.rejectedGrams),
        payable_inr: rupees(b.valuations[0]?.payablePaise),
        pickup_fee_inr: rupees(b.pickupFeePaise),
      }));
    }
    case "payouts": {
      const rows = await db.payout.findMany({
        where: { createdAt: r, ...(f.paymentStatus ? { status: f.paymentStatus as never } : {}), ...(f.city ? { booking: { serviceArea: { city: f.city } } } : {}) },
        include: { booking: true, customer: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      return rows.map((p) => ({
        payout: p.code,
        booking: p.booking.code,
        customer: p.customer.name,
        customer_id: p.customerId,
        amount_inr: rupees(p.amountPaise),
        upi: p.upiVpa,
        provider: p.provider,
        provider_ref: p.providerRef,
        utr: p.utr,
        status: p.status,
        attempts: p.attemptCount,
        created: iso(p.createdAt),
        completed: iso(p.completedAt),
      }));
    }
    case "revenue": {
      const rows = await db.financialLedger.findMany({ where: { createdAt: r }, orderBy: { createdAt: "desc" }, take: 10000 });
      return rows.map((l) => ({ date: iso(l.createdAt), entry: l.entryGroup, account: l.account, direction: l.direction, amount_inr: rupees(l.amountPaise), reference: `${l.referenceType}:${l.referenceId}`, description: l.description }));
    }
    case "inventory": {
      const rows = await db.inventoryItem.findMany({
        where: { createdAt: r, ...(f.categoryId ? { categoryId: f.categoryId } : {}), ...(f.city ? { warehouse: { city: f.city } } : {}) },
        include: { category: true, warehouse: true, batch: true },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });
      return rows.map((i) => ({ code: i.code, kind: i.kind, grade: i.grade, category: i.category.name, warehouse: i.warehouse.name, batch: i.batch?.code ?? null, weight_kg: kg(i.weightGrams), quantity: i.quantity, status: i.status, title: i.title, created: iso(i.createdAt) }));
    }
    case "resale": {
      const rows = await db.marketplaceOrder.findMany({ where: { createdAt: r }, include: { items: true, buyer: true }, orderBy: { createdAt: "desc" }, take: 5000 });
      return rows.map((o) => ({ order: o.code, buyer: o.buyer.name, items: o.items.map((i) => i.name).join("; "), subtotal_inr: rupees(o.subtotalPaise), shipping_inr: rupees(o.shippingPaise), total_inr: rupees(o.totalPaise), status: o.status, payment: o.paymentStatus, created: iso(o.createdAt) }));
    }
    case "b2b": {
      const rows = await db.purchaseOrder.findMany({ where: { createdAt: r }, include: { business: true, listing: { include: { category: true } } }, orderBy: { createdAt: "desc" }, take: 5000 });
      return rows.map((p) => ({ po: p.code, invoice: p.invoiceNumber, business: p.business.legalName, type: p.business.businessType, listing: p.listing.title, grade: p.listing.grade, category: p.listing.category.name, kg: kg(p.requestedGrams), price_per_kg_inr: rupees(p.agreedPricePerKgPaise ?? p.listPricePerKgPaise), total_inr: rupees(p.totalPaise), status: p.status, payment: p.paymentStatus, created: iso(p.createdAt) }));
    }
    case "recycling": {
      const rows = await db.recyclerDispatch.findMany({ where: { createdAt: r }, include: { partner: true }, orderBy: { createdAt: "desc" } });
      return rows.map((d) => ({ dispatch: d.code, partner: d.partner.name, city: d.partner.city, dispatched_kg: kg(d.dispatchedGrams), received_kg: d.receivedGrams === null ? null : kg(d.receivedGrams), rate_per_kg_inr: rupees(d.ratePerKgPaise), settlement_inr: rupees(d.settlementPaise), status: d.status, settlement_ref: d.settlementRef, created: iso(d.createdAt) }));
    }
    case "donations": {
      const rows = await db.donation.findMany({ where: { createdAt: r }, include: { partner: true, booking: true, donor: true }, orderBy: { createdAt: "desc" } });
      return rows.map((d) => ({ donation: d.code, booking: d.booking.code, donor: d.donor.name, ngo: d.partner.name, collected_kg: d.collectedGrams === null ? null : kg(d.collectedGrams), status: d.status, receipt: d.receiptNumber, acknowledged: iso(d.acknowledgedAt), created: iso(d.createdAt) }));
    }
    case "collectors": {
      const rows = await collectorPerformance(f.from || f.to ? { from: r.gte ?? new Date(0), to: r.lt ?? new Date(8.64e15) } : undefined);
      return rows.map((c) => ({ collector: c.name, code: c.code, assigned: c.assigned, completed: c.completed, failed: c.failed, completion_rate_pct: c.assigned ? Math.round((c.completed / c.assigned) * 100) : 0, kg_collected: c.kg }));
    }
    case "profitability": {
      const rows = await db.$queryRaw<{ month: Date; account: string; debit: bigint; credit: bigint }[]>`
        SELECT date_trunc('month', "createdAt") AS month, account::text, SUM(CASE WHEN direction='DEBIT' THEN "amountPaise" ELSE 0 END)::bigint AS debit,
               SUM(CASE WHEN direction='CREDIT' THEN "amountPaise" ELSE 0 END)::bigint AS credit
        FROM "FinancialLedger"
        WHERE (${r.gte ?? null}::timestamptz IS NULL OR "createdAt" >= ${r.gte ?? null}::timestamptz) AND (${r.lt ?? null}::timestamptz IS NULL OR "createdAt" < ${r.lt ?? null}::timestamptz)
        GROUP BY 1, 2 ORDER BY 1`;
      const months = new Map<string, Row>();
      for (const x of rows) {
        const k = x.month.toISOString().slice(0, 7);
        const row = months.get(k) ?? { month: k, marketplace_inr: 0, b2b_inr: 0, recycling_inr: 0, refunds_inr: 0, customer_payouts_inr: 0, logistics_inr: 0, sorting_inr: 0, processing_inr: 0 };
        const net = (Number(x.credit) - Number(x.debit)) / 100;
        const cost = (Number(x.debit) - Number(x.credit)) / 100;
        if (x.account === "MARKETPLACE_REVENUE") row.marketplace_inr = net;
        if (x.account === "B2B_REVENUE") row.b2b_inr = net;
        if (x.account === "RECYCLING_REVENUE") row.recycling_inr = net;
        if (x.account === "REFUNDS") row.refunds_inr = cost;
        if (x.account === "CUSTOMER_PAYOUTS") row.customer_payouts_inr = cost;
        if (x.account === "LOGISTICS_COST") row.logistics_inr = cost;
        if (x.account === "SORTING_COST") row.sorting_inr = cost;
        if (x.account === "PROCESSING_COST") row.processing_inr = cost;
        months.set(k, row);
      }
      return [...months.values()].map((m) => {
        const revenue = (m.marketplace_inr as number) + (m.b2b_inr as number) + (m.recycling_inr as number) - (m.refunds_inr as number);
        const costs = (m.customer_payouts_inr as number) + (m.logistics_inr as number) + (m.sorting_inr as number) + (m.processing_inr as number);
        return { ...m, net_revenue_inr: revenue, total_costs_inr: costs, gross_contribution_inr: Math.round((revenue - costs) * 100) / 100 };
      });
    }
    case "customers": {
      const rows = await db.user.findMany({
        where: { role: { key: "CUSTOMER" }, createdAt: r },
        include: { customerProfile: true, _count: { select: { bookings: true } }, payouts: { where: { status: "SUCCESSFUL" }, select: { amountPaise: true } } },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });
      return rows.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, status: u.status, bookings: u._count.bookings, paid_inr: rupees(u.payouts.reduce((s, p) => s + p.amountPaise, 0)), reward_points: u.customerProfile?.rewardPoints ?? 0, joined: iso(u.createdAt) }));
    }
  }
}

/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function toCsv(rows: Row[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}

export async function toXlsx(title: string, rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ReWear";
  const ws = wb.addWorksheet(title.slice(0, 31));
  if (rows.length) {
    const headers = Object.keys(rows[0]);
    ws.columns = headers.map((h) => ({ header: h.replace(/_/g, " ").toUpperCase(), key: h, width: Math.min(40, Math.max(12, h.length + 4)) }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174B37" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
