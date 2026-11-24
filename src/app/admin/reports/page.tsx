import { FileSpreadsheet, FileText } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { buildReport, REPORTS, type ReportKey } from "@/server/services/reports";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayIST } from "@/lib/dates";
import { payoutStatus } from "@/lib/labels";

export const metadata = { title: "Reports" };

const PRESETS = [["Today", 0], ["Last 7 days", 6], ["Last 30 days", 29], ["Last 365 days", 364]] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const report = (sp.report && sp.report in REPORTS ? sp.report : "collections") as ReportKey;
  const filters = { from: sp.from || addDays(todayIST(), -29), to: sp.to || todayIST(), city: sp.city || undefined, categoryId: sp.categoryId || undefined, collectorId: sp.collectorId || undefined, paymentStatus: sp.paymentStatus || undefined };
  const [rows, cities, categories, collectors] = await Promise.all([
    buildReport(report, filters),
    db.serviceArea.findMany({ distinct: ["city"], select: { city: true } }),
    db.clothingCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.collectorProfile.findMany({ include: { user: true } }),
  ]);
  const qs = new URLSearchParams(Object.entries({ report, ...filters }).filter(([, v]) => v) as [string, string][]).toString();
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const numericTotals = headers.filter((h) => /_(kg|inr)$|^(assigned|completed|failed|bookings)$/.test(h)).map((h) => [h, rows.reduce((s, r) => s + (typeof r[h] === "number" ? (r[h] as number) : 0), 0)] as const);

  return (
    <>
      <PageHeader title="Reports & exports" description="Daily, weekly, monthly and yearly reporting with CSV and Excel export." />
      <form className="mb-4 space-y-3 rounded-2xl border border-line bg-white p-4">
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Select name="report" defaultValue={report} className="h-10 sm:col-span-2" aria-label="Report">{Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Input type="date" name="from" defaultValue={filters.from} className="h-10" aria-label="From" />
          <Input type="date" name="to" defaultValue={filters.to} className="h-10" aria-label="To" />
          <Select name="city" defaultValue={filters.city ?? ""} className="h-10" aria-label="City"><option value="">All cities</option>{cities.map((c) => <option key={c.city}>{c.city}</option>)}</Select>
          <Select name="categoryId" defaultValue={filters.categoryId ?? ""} className="h-10" aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select name="collectorId" defaultValue={filters.collectorId ?? ""} className="h-10" aria-label="Collector"><option value="">All collectors</option>{collectors.map((c) => <option key={c.id} value={c.id}>{c.user.name}</option>)}</Select>
          <Select name="paymentStatus" defaultValue={filters.paymentStatus ?? ""} className="h-10" aria-label="Payment status"><option value="">Any payment status</option>{Object.entries(payoutStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(([label, days]) => <a key={label} href={`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), from: addDays(todayIST(), -days), to: todayIST() })}`} className="rounded-full bg-cream px-3 py-1 text-xs font-medium hover:bg-cream-200">{label}</a>)}
          <span className="flex-1" />
          <Button type="submit" variant="secondary" size="sm">Run report</Button>
          <Button asChild size="sm"><a href={`/api/reports/export?${qs}&format=csv`}><FileText /> CSV</a></Button>
          <Button asChild size="sm"><a href={`/api/reports/export?${qs}&format=xlsx`}><FileSpreadsheet /> Excel</a></Button>
        </div>
      </form>
      <p className="mb-2 text-sm text-muted">{rows.length} rows{numericTotals.length > 0 && " · totals: " + numericTotals.map(([h, v]) => `${h.replace(/_/g, " ")} ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`).join(" · ")}</p>
      <Card>
        <Table>
          <thead><tr>{headers.map((h) => <Th key={h}>{h.replace(/_/g, " ")}</Th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i}>{headers.map((h) => <Td key={h} className={typeof r[h] === "number" ? "num text-right" : "text-sm"}>{r[h] === null ? "—" : typeof r[h] === "number" ? (r[h] as number).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(r[h])}</Td>)}</tr>)}</tbody>
        </Table>
        {rows.length > 200 && <p className="px-5 py-3 text-xs text-muted">Preview shows 200 rows — export for the full dataset.</p>}
      </Card>
    </>
  );
}
