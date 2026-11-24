import Image from "next/image";
import Link from "next/link";
import { Store } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { fulfilmentAction, publishAction } from "@/app/actions/warehouse";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { orderStatus } from "@/lib/labels";
import { formatDate, formatINR, titleCase } from "@/lib/utils";

export const metadata = { title: "Resale listings" };

export default async function ListingsPage() {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const [products, orders, ready] = await Promise.all([
    db.marketplaceProduct.findMany({ where: { deletedAt: null }, include: { inventoryItem: true, category: true }, orderBy: { updatedAt: "desc" } }),
    db.marketplaceOrder.findMany({ where: { status: { in: ["PAID", "PACKED", "SHIPPED"] } }, include: { items: true, buyer: true }, orderBy: { paidAt: "asc" } }),
    db.inventoryItem.findMany({ where: { kind: "UNIT", grade: "PREMIUM_REUSABLE", inspectionPassed: true, product: null, status: "IN_STOCK" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Premium resale" description="Only garments that passed premium inspection can be published." />
      {ready.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Inspected & ready to list" />
          <ul className="divide-y divide-line">{ready.map((i) => <li key={i.id} className="flex items-center justify-between px-5 py-3 text-sm"><span><span className="num font-medium">{i.code}</span> · {i.title} · {i.brand} · {i.size}</span><Link href={`/warehouse/listings/new?itemId=${i.id}`} className="font-medium text-forest">Create listing →</Link></li>)}</ul>
        </Card>
      )}
      <Card className="mb-6">
        <CardHeader title="Orders to fulfil" />
        {orders.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No open orders.</p> : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Items</Th><Th>Status</Th><Th>Next step</Th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <Td><div className="num font-medium">{o.code}</div><div className="text-xs text-muted">{o.buyer.name} · paid {formatDate(o.paidAt)}</div></Td>
                  <Td className="text-sm">{o.items.map((i) => i.name).join(", ")}</Td>
                  <Td><StatusBadge map={orderStatus} value={o.status} /></Td>
                  <Td>
                    {o.status === "PAID" && <ActionButton action={fulfilmentAction} fields={{ orderId: o.id, to: "PACKED" }}>Mark packed</ActionButton>}
                    {o.status === "PACKED" && (
                      <ActionForm action={fulfilmentAction} className="flex gap-1">
                        <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="to" value="SHIPPED" />
                        <Input name="courier" placeholder="Courier" className="h-8 w-24 text-xs" /><Input name="trackingNumber" placeholder="AWB" className="h-8 w-28 text-xs" />
                        <SubmitButton size="sm">Ship</SubmitButton>
                      </ActionForm>
                    )}
                    {o.status === "SHIPPED" && <ActionButton action={fulfilmentAction} fields={{ orderId: o.id, to: "DELIVERED" }}>Mark delivered</ActionButton>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {products.length === 0 ? <EmptyState icon={Store} title="No listings yet" /> : (
        <Card>
          <CardHeader title="All listings" />
          <Table>
            <thead><tr><Th>Garment</Th><Th>Inspection</Th><Th className="text-right">Price</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <Td><div className="flex items-center gap-3"><div className="relative size-12 overflow-hidden rounded-lg bg-cream">{p.photoUrls[0] && <Image src={p.photoUrls[0]} alt="" fill sizes="48px" className="object-cover" unoptimized={p.photoUrls[0].startsWith("/api/")} />}</div><div><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.brand} · {p.size} · {p.category.name}</div></div></div></Td>
                  <Td>{p.inventoryItem?.inspectionPassed ? <Badge tone="green">Passed</Badge> : <Badge tone="amber">Pending</Badge>}</Td>
                  <Td className="num text-right">{formatINR(p.pricePaise)}</Td>
                  <Td className="text-xs">{titleCase(p.status)}</Td>
                  <Td>
                    {p.status === "PUBLISHED" ? <ActionButton action={publishAction} fields={{ id: p.id, publish: "false" }} variant="ghost">Unpublish</ActionButton> : ["DRAFT", "UNPUBLISHED"].includes(p.status) ? <ActionButton action={publishAction} fields={{ id: p.id, publish: "true" }} variant="primary">Publish</ActionButton> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
