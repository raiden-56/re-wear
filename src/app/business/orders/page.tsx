import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { poStatus } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Orders & invoices" };

export default async function BusinessOrders() {
  const user = await requireRole(["B2B_BUYER"]);
  const orders = await db.purchaseOrder.findMany({ where: { business: { userId: user.id } }, include: { listing: true }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Orders & invoices" description="Full transaction history." />
      {orders.length === 0 ? <EmptyState icon={Receipt} title="No orders yet" /> : (
        <Card>
          <Table>
            <thead><tr><Th>PO</Th><Th>Listing</Th><Th className="text-right">Qty</Th><Th className="text-right">₹/kg</Th><Th className="text-right">Total</Th><Th>Invoice</Th><Th>Payment</Th><Th>Status</Th></tr></thead>
            <tbody>{orders.map((o) => <tr key={o.id}><Td><Link href={`/business/orders/${o.id}`} className="num font-medium text-forest">{o.code}</Link><div className="text-xs text-muted">{formatDate(o.createdAt)}</div></Td><Td className="text-sm">{o.listing.title}</Td><Td className="num text-right">{formatKg(o.requestedGrams, 0)}</Td><Td className="num text-right">{formatINR(o.agreedPricePerKgPaise ?? o.listPricePerKgPaise)}</Td><Td className="num text-right">{o.totalPaise ? formatINR(o.totalPaise) : "—"}</Td><Td>{o.invoiceNumber ? <Link href={`/receipts/invoice/${o.code}`} className="num text-xs text-forest underline">{o.invoiceNumber}</Link> : "—"}</Td><Td className="text-xs">{o.paymentStatus.toLowerCase()}</Td><Td><StatusBadge map={poStatus} value={o.status} /></Td></tr>)}</tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
