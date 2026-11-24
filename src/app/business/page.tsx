import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch, Receipt, Scale, Wallet } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Notice, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { businessTypeLabel, poStatus, verificationStatus } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function BusinessHome() {
  const user = await requireRole(["B2B_BUYER"]);
  const biz = await db.businessProfile.findUnique({ where: { userId: user.id }, include: { purchaseOrders: { include: { listing: true }, orderBy: { updatedAt: "desc" } } } });
  if (!biz) redirect("/partners/register?type=business");
  const done = biz.purchaseOrders.filter((p) => ["CONFIRMED", "DISPATCHED", "DELIVERED"].includes(p.status));
  return (
    <>
      <PageHeader title={biz.tradeName ?? biz.legalName} description={`${businessTypeLabel[biz.businessType]} · ${biz.city}`} actions={<StatusBadge map={verificationStatus} value={biz.verificationStatus} />} />
      {biz.verificationStatus === "PENDING" && <Notice tone="warn" title="Verification in progress" className="mb-5">Our team is verifying your GSTIN and details. You can browse the catalogue; purchase requests open once verified.</Notice>}
      {biz.verificationStatus === "REJECTED" && <Notice tone="danger" title="Verification unsuccessful" className="mb-5">{biz.rejectionReason ?? "Please contact support."}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Purchased" value={formatKg(done.reduce((s, p) => s + p.requestedGrams, 0), 0)} icon={Scale} tone="forest" />
        <Stat label="Order value" value={formatINR(done.reduce((s, p) => s + (p.totalPaise ?? 0), 0), { whole: true })} icon={Wallet} />
        <Stat label="Open requests" value={biz.purchaseOrders.filter((p) => ["REQUESTED", "NEGOTIATING"].includes(p.status)).length} icon={PackageSearch} />
        <Stat label="Pricing tier" value={biz.priceTier} hint={biz.discountBps ? `${biz.discountBps / 100}% partner discount` : "List prices"} icon={Receipt} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Recent orders" action={<Button asChild size="sm"><Link href="/business/catalogue">Browse stock</Link></Button>} />
        <Table>
          <thead><tr><Th>PO</Th><Th>Listing</Th><Th className="text-right">Qty</Th><Th className="text-right">Total</Th><Th>Status</Th><Th>Updated</Th></tr></thead>
          <tbody>{biz.purchaseOrders.slice(0, 10).map((p) => <tr key={p.id}><Td><Link href={`/business/orders/${p.id}`} className="num font-medium text-forest">{p.code}</Link></Td><Td className="text-sm">{p.listing.title}</Td><Td className="num text-right">{formatKg(p.requestedGrams, 0)}</Td><Td className="num text-right">{p.totalPaise ? formatINR(p.totalPaise) : "—"}</Td><Td><StatusBadge map={poStatus} value={p.status} /></Td><Td className="text-xs text-muted">{formatDate(p.updatedAt)}</Td></tr>)}</tbody>
        </Table>
      </Card>
    </>
  );
}
