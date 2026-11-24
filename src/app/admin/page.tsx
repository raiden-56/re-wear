import Link from "next/link";
import { AlertCircle, Boxes, IndianRupee, Recycle, Scale, Sparkles, Truck, Users } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { adminKpis, b2bSalesSeries, categoryDistribution, cityPerformance, collectionSeries, collectorPerformance, inventoryDistribution, revenueSeries } from "@/server/services/analytics";
import { Card, CardHeader, PageHeader, Stat, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { RankBars, StackedBars, TrendArea, TrendBars, fmtInr, fmtKg } from "@/components/charts/charts";
import { gradeLabel } from "@/lib/labels";
import { formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const range = (await searchParams).range ?? "daily";
  const bucket = range === "weekly" ? "week" : range === "monthly" ? "month" : "day";
  const periods = bucket === "day" ? 30 : bucket === "week" ? 12 : 6;
  const [k, series, revenue, cats, cities, collectors, inv, b2b, attention] = await Promise.all([
    adminKpis(),
    collectionSeries(bucket, periods),
    revenueSeries(6),
    categoryDistribution(),
    cityPerformance(),
    collectorPerformance(),
    inventoryDistribution(),
    b2bSalesSeries(6),
    Promise.all([
      db.booking.count({ where: { status: "SCHEDULED" } }),
      db.payout.count({ where: { status: { in: ["AWAITING_APPROVAL", "UNDER_REVIEW"] } } }),
      db.payout.count({ where: { status: { in: ["FAILED", "REVERSED"] } } }),
      db.booking.count({ where: { status: "DISPUTED" } }),
      db.pricingRule.count({ where: { approvalStatus: "PENDING" } }),
      db.businessProfile.count({ where: { verificationStatus: "PENDING" } }),
    ]),
  ]);
  const [unassigned, payoutsToApprove, failedPayouts, disputes, pricingPending, bizPending] = attention;
  const actions = [
    [unassigned, "bookings without a collector", "/admin/bookings?status=SCHEDULED"],
    [payoutsToApprove, "payouts awaiting approval", "/admin/payments?status=AWAITING_APPROVAL"],
    [failedPayouts, "failed payouts to retry", "/admin/payments?status=FAILED"],
    [disputes, "valuation disputes", "/admin/support"],
    [pricingPending, "rate changes to approve", "/admin/pricing"],
    [bizPending, "businesses to verify", "/admin/b2b"],
  ].filter(([n]) => (n as number) > 0) as [number, string, string][];

  return (
    <>
      <PageHeader title="Operations dashboard" description="Live view across collection, payouts, inventory and sales." />
      {actions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {actions.map(([n, l, href]) => (
            <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-full border border-amber bg-amber-100 px-3.5 py-1.5 text-sm font-medium text-[#6b4813] hover:bg-amber/40"><AlertCircle className="size-4" /> <span className="num">{n}</span> {l}</Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total KG collected" value={formatKg(k.collectedGrams, 0)} hint={`avg ${formatKg(k.avgGramsPerBooking, 1)} per pickup`} icon={Scale} tone="forest" />
        <Stat label="Customer payouts" value={formatINR(k.payoutsPaid, { whole: true })} hint={`${formatINR(k.payoutsPending, { whole: true })} pending (${k.payoutsPendingCount})`} icon={IndianRupee} />
        <Stat label="Revenue" value={formatINR(k.revenue, { whole: true })} hint={`B2B ${formatINR(k.b2bRevenue, { whole: true })}`} icon={Sparkles} />
        <Stat label="Gross contribution" value={formatINR(k.grossContribution, { whole: true })} hint={`after payouts & ${formatINR(k.operatingCosts, { whole: true })} costs`} icon={IndianRupee} />
        <Stat label="Customers" value={k.customers} icon={Users} />
        <Stat label="Pickups" value={k.totalPickups} hint={`${k.completedPickups} completed · ${k.pendingPickups} pending`} icon={Truck} />
        <Stat label="Free pickups" value={k.freePickups} hint="Pickup fee collected: ₹0" icon={Truck} />
        <Stat label="Inventory" value={formatKg(k.reusableGrams + k.recyclingGrams + k.premiumGrams, 0)} hint={`${formatKg(k.premiumGrams, 0)} premium · ${formatKg(k.recyclingGrams, 0)} recycling`} icon={Boxes} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Collection volume" description={`KG accepted · last ${periods} ${bucket}s`} />
          <div className="px-5 pt-3"><Tabs items={[{ href: "/admin?range=daily", label: "Daily" }, { href: "/admin?range=weekly", label: "Weekly" }, { href: "/admin?range=monthly", label: "Monthly" }]} active={`/admin?range=${range}`} /></div>
          <div className="px-3 pb-4">{bucket === "day" ? <TrendArea data={series} dataKey="kg" format={fmtKg} label="Collected" /> : <TrendBars data={series} dataKey="kg" format={fmtKg} label="Collected" />}</div>
        </Card>
        <Card>
          <CardHeader title="Customer payout trend" description="Approved valuation amounts by completion date" />
          <div className="px-3 pb-4 pt-4"><TrendBars data={series} dataKey="payout" format={fmtInr} label="Payouts" /></div>
        </Card>
        <Card>
          <CardHeader title="Revenue by channel" description="Ledger revenue · last 6 months" />
          <div className="px-5 pb-4 pt-4">
            {revenue.length ? <StackedBars data={revenue} series={[{ key: "marketplace", label: "Premium resale" }, { key: "b2b", label: "B2B" }, { key: "recycling", label: "Recycling" }]} format={fmtInr} /> : <p className="text-sm text-muted">No revenue recorded yet.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="B2B sales" description="Confirmed purchase orders, KG per month" />
          <div className="px-3 pb-4 pt-4">{b2b.length ? <TrendBars data={b2b} dataKey="kg" format={fmtKg} label="B2B volume" height={200} /> : <p className="px-2 text-sm text-muted">No B2B orders yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Category distribution" description="KG collected by clothing category" />
          <div className="px-3 pb-4 pt-4"><RankBars data={cats.slice(0, 10)} nameKey="name" valueKey="kg" format={fmtKg} /></div>
        </Card>
        <Card>
          <CardHeader title="Inventory distribution" description="Current stock by sorting grade" />
          <div className="px-3 pb-4 pt-4"><RankBars data={inv.filter((i) => i.kg > 0).map((i) => ({ grade: gradeLabel[i.grade]?.label ?? i.grade, kg: i.kg })).sort((a, b) => b.kg - a.kg)} nameKey="grade" valueKey="kg" format={fmtKg} /></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="City performance" />
          <Table>
            <thead><tr><Th>City</Th><Th className="text-right">Bookings</Th><Th className="text-right">Completed</Th><Th className="text-right">KG</Th></tr></thead>
            <tbody>{cities.map((c) => <tr key={c.city}><Td className="font-medium">{c.city}</Td><Td className="num text-right">{c.bookings}</Td><Td className="num text-right">{c.completed}</Td><Td className="num text-right">{c.kg.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Collector performance" action={<Link href="/admin/reports?report=collectors" className="text-sm font-medium text-forest">Report</Link>} />
          <Table>
            <thead><tr><Th>Collector</Th><Th className="text-right">Assigned</Th><Th className="text-right">Completed</Th><Th className="text-right">Failed</Th><Th className="text-right">KG</Th></tr></thead>
            <tbody>{collectors.map((c) => <tr key={c.code}><Td><div className="font-medium">{c.name}</div><div className="num text-xs text-muted">{c.code}</div></Td><Td className="num text-right">{c.assigned}</Td><Td className="num text-right">{c.completed}</Td><Td className="num text-right">{c.failed}</Td><Td className="num text-right">{c.kg.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Td></tr>)}</tbody>
          </Table>
        </Card>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Recycle className="size-3.5" /> Every chart has a tabular export in Reports.</p>
    </>
  );
}
