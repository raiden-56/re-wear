import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { refundAction } from "@/app/actions/admin";
import { fulfilmentAction } from "@/app/actions/warehouse";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { orderStatus } from "@/lib/labels";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata = { title: "Marketplace" };

export default async function AdminMarketplace() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [orders, counts, buyers, categories] = await Promise.all([
    db.marketplaceOrder.findMany({ include: { buyer: true, items: true, refunds: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.marketplaceProduct.groupBy({ by: ["status"], _count: true }),
    db.marketplaceOrder.groupBy({ by: ["buyerId"], _count: true }),
    db.clothingCategory.findMany({ include: { _count: { select: { products: true } } }, orderBy: { sortOrder: "asc" } }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  const gmv = orders.filter((o) => o.paymentStatus !== "PENDING" && o.paymentStatus !== "FAILED").reduce((s, o) => s + o.totalPaise, 0);
  return (
    <>
      <PageHeader title="Premium resale marketplace" description="Listings are created from inspected warehouse garments." actions={<Button asChild variant="secondary"><Link href="/warehouse/listings">Manage listings</Link></Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Published" value={c("PUBLISHED")} tone="forest" />
        <Stat label="Drafts" value={c("DRAFT") + c("UNPUBLISHED")} />
        <Stat label="Sold" value={c("SOLD_OUT")} />
        <Stat label="GMV (recent 100 orders)" value={formatINR(gmv, { whole: true })} hint={`${buyers.length} buyers`} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Orders" />
        <Table>
          <thead><tr><Th>Order</Th><Th>Buyer</Th><Th>Items</Th><Th className="text-right">Total</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <Td><div className="num font-medium">{o.code}</div><div className="text-xs text-muted">{formatDate(o.createdAt, true)}</div></Td>
                <Td className="text-sm">{o.buyer.name}</Td>
                <Td className="max-w-56 text-sm">{o.items.map((i) => i.name).join(", ")}</Td>
                <Td className="num text-right">{formatINR(o.totalPaise)}{o.refunds.length > 0 && <div className="text-xs text-muted">refunded {formatINR(o.refunds.reduce((s, r) => s + r.amountPaise, 0))}</div>}</Td>
                <Td><StatusBadge map={orderStatus} value={o.status} /></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {["PAID", "PACKED"].includes(o.status) && <ActionButton action={fulfilmentAction} fields={{ orderId: o.id, to: "CANCELLED" }} variant="ghost" confirm="Cancel and fully refund this order?">Cancel & refund</ActionButton>}
                    {o.status === "DELIVERED" && o.paymentStatus === "CAPTURED" && (
                      <ActionForm action={refundAction} className="flex gap-1"><input type="hidden" name="orderId" value={o.id} /><Input name="amount" type="number" placeholder="₹" className="h-8 w-20 text-xs" /><Input name="reason" placeholder="Reason" className="h-8 w-28 text-xs" /><SubmitButton size="sm" variant="secondary">Refund</SubmitButton></ActionForm>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Product categories" />
        <div className="flex flex-wrap gap-2 p-5">{categories.map((cat) => <span key={cat.id} className="rounded-full bg-cream px-3 py-1 text-sm">{cat.name} <span className="num text-muted">{cat._count.products}</span></span>)}</div>
      </Card>
    </>
  );
}
