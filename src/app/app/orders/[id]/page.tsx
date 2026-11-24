import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Package, Truck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { cancelOrderAction, reviewAction } from "@/app/actions/shop";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, KeyValue, StatusBadge } from "@/components/ui/primitives";
import { SuccessBurst } from "@/components/success-burst";
import { orderStatus } from "@/lib/labels";
import { cn, formatDate, formatINR } from "@/lib/utils";

const STEPS = [["PAID", "Paid"], ["PACKED", "Packed"], ["SHIPPED", "Shipped"], ["DELIVERED", "Delivered"]] as const;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const user = await requireRole(["CUSTOMER"]);
  const o = await db.marketplaceOrder.findFirst({ where: { id: (await params).id, buyerId: user.id }, include: { items: { include: { product: true } }, refunds: true } });
  if (!o) notFound();
  const { paid } = await searchParams;
  const reviews = await db.review.findMany({ where: { orderId: o.id, userId: user.id } });
  const idx = STEPS.findIndex(([s]) => s === o.status);
  const addr = o.shippingAddress as { name: string; line1: string; city: string; pincode: string };
  return (
    <div className="space-y-5">
      <Link href="/app/orders" className="inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Orders</Link>
      {paid && o.status === "PAID" && <SuccessBurst title="Payment received — order confirmed" subtitle="We'll pack it within 24 hours." />}
      <div className="flex items-center justify-between"><h1 className="num text-2xl font-bold">{o.code}</h1><StatusBadge map={orderStatus} value={o.status} /></div>
      {idx >= 0 && (
        <Card className="p-5">
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map(([s, l], i) => (
              <li key={s} className="text-center">
                <div className={cn("mx-auto grid size-9 place-items-center rounded-full", i <= idx ? "bg-forest text-white" : "bg-cream-200 text-muted")}>{i === 2 ? <Truck className="size-4" /> : i === 1 ? <Package className="size-4" /> : <Check className="size-4" />}</div>
                <div className="mt-1.5 text-xs font-medium">{l}</div>
              </li>
            ))}
          </ol>
          {o.trackingNumber && <p className="mt-4 text-center text-sm text-muted">{o.courier} · tracking <span className="num font-medium text-charcoal">{o.trackingNumber}</span></p>}
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Items" />
          <ul className="divide-y divide-line">
            {o.items.map((i) => {
              const reviewed = reviews.some((r) => r.productId === i.productId);
              return (
                <li key={i.id} className="space-y-3 p-5">
                  <div className="flex gap-4">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">{i.product.photoUrls[0] && <Image src={i.product.photoUrls[0]} alt="" fill sizes="80px" className="object-cover" />}</div>
                    <div className="flex-1"><Link href={`/shop/${i.product.slug}`} className="font-medium hover:underline">{i.name}</Link><div className="num text-sm text-muted">{formatINR(i.pricePaise)}</div></div>
                  </div>
                  {o.status === "DELIVERED" && !reviewed && (
                    <ActionForm action={reviewAction} className="space-y-2 rounded-2xl bg-cream p-4">
                      <input type="hidden" name="productId" value={i.productId} />
                      <input type="hidden" name="orderId" value={o.id} />
                      <div className="grid grid-cols-[100px_1fr] gap-2"><Select name="rating" defaultValue="5" aria-label="Rating">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</Select><Input name="title" placeholder="Headline" aria-label="Review title" /></div>
                      <Textarea name="body" rows={2} placeholder="How's the fit and condition?" aria-label="Review" />
                      <SubmitButton size="sm">Post review</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <KeyValue items={[["Subtotal", formatINR(o.subtotalPaise)], ["Shipping", o.shippingPaise ? formatINR(o.shippingPaise) : "Free"], ["Total", formatINR(o.totalPaise)], ["Payment", o.paymentStatus.replace(/_/g, " ").toLowerCase()], ["Placed", formatDate(o.createdAt, true)]]} />
            {o.refunds.map((r) => <p key={r.id} className="mt-2 text-sm text-muted">Refund {formatINR(r.amountPaise)} · {r.status.toLowerCase()}</p>)}
            <p className="mt-4 text-sm"><span className="font-medium">{addr.name}</span><br /><span className="text-muted">{addr.line1}, {addr.city} {addr.pincode}</span></p>
          </Card>
          {["PENDING_PAYMENT", "PAID", "PACKED"].includes(o.status) && (
            <Card className="p-5">
              <ActionForm action={cancelOrderAction} className="space-y-2">
                <input type="hidden" name="orderId" value={o.id} />
                <Field label="Cancel this order"><Input name="reason" placeholder="Reason" /></Field>
                <SubmitButton variant="ghost" size="sm" className="text-danger">Cancel order</SubmitButton>
              </ActionForm>
              {o.status === "PENDING_PAYMENT" && <Link href={`/shop/pay/${o.id}`} className="mt-3 block text-sm font-medium text-forest">Complete payment →</Link>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
