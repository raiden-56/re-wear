import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Truck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { buyerAcceptAction, buyerCancelAction, buyerCounterAction, buyerDeliveredAction } from "@/app/actions/partners";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, KeyValue, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { Negotiation } from "@/components/b2b/negotiation";
import { poStatus } from "@/lib/labels";
import { cn, formatDate, formatINR, formatKg } from "@/lib/utils";

const TRACK = ["REQUESTED", "NEGOTIATING", "CONFIRMED", "DISPATCHED", "DELIVERED"];

export default async function BusinessOrder({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["B2B_BUYER"]);
  const po = await db.purchaseOrder.findFirst({ where: { id: (await params).id, business: { userId: user.id } }, include: { listing: true, offers: { orderBy: { createdAt: "asc" } } } });
  if (!po) notFound();
  const last = po.offers[po.offers.length - 1];
  const idx = TRACK.indexOf(po.status);
  return (
    <>
      <Link href="/business/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Orders</Link>
      <PageHeader title={<span className="num">{po.code}</span>} description={po.listing.title} actions={<StatusBadge map={poStatus} value={po.status} />} />
      {idx >= 0 && (
        <Card className="mb-6 p-5">
          <ol className="grid grid-cols-5 gap-2 text-center text-xs">{TRACK.map((s, i) => <li key={s}><div className={cn("mx-auto mb-1.5 h-1.5 rounded-full", i <= idx ? "bg-forest" : "bg-cream-200")} />{poStatus[s].label}</li>)}</ol>
          {po.trackingNumber && <p className="mt-4 flex items-center justify-center gap-2 text-sm"><Truck className="size-4 text-forest" /> {po.courier} · <span className="num">{po.trackingNumber}</span></p>}
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Negotiation" />
          <div className="space-y-4 p-5">
            <Negotiation offers={po.offers} viewerSide="BUYER" />
            {["REQUESTED", "NEGOTIATING"].includes(po.status) && (
              <>
                {last?.byRole === "REWEAR" && <ActionButton action={buyerAcceptAction} fields={{ poId: po.id }} variant="primary" size="md">Accept {formatINR(last.pricePerKgPaise)}/kg & confirm</ActionButton>}
                <ActionForm action={buyerCounterAction} className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <input type="hidden" name="poId" value={po.id} />
                  <Input name="price" type="number" step="0.5" placeholder="₹/kg" className="w-28" />
                  <Input name="kg" type="number" defaultValue={po.requestedGrams / 1000} className="w-24" />
                  <Input name="message" placeholder="Message" className="min-w-40 flex-1" />
                  <SubmitButton variant="secondary">Send offer</SubmitButton>
                </ActionForm>
              </>
            )}
            {["REQUESTED", "NEGOTIATING", "CONFIRMED"].includes(po.status) && (
              <ActionForm action={buyerCancelAction} className="flex gap-2"><input type="hidden" name="poId" value={po.id} /><Input name="reason" placeholder="Reason to cancel" /><SubmitButton variant="ghost" size="sm">Cancel request</SubmitButton></ActionForm>
            )}
          </div>
        </Card>
        <Card className="h-fit p-5">
          <KeyValue items={[["Quantity", formatKg(po.requestedGrams, 0)], ["Your price", `${formatINR(po.listPricePerKgPaise)}/kg`], ["Agreed", po.agreedPricePerKgPaise ? `${formatINR(po.agreedPricePerKgPaise)}/kg` : "—"], ["Total (excl. GST)", po.totalPaise ? formatINR(po.totalPaise) : "—"], ["Payment", po.paymentStatus.toLowerCase()], ["Confirmed", formatDate(po.confirmedAt)], ["Delivered", formatDate(po.deliveredAt)]]} />
          {po.invoiceNumber && <Link href={`/receipts/invoice/${po.code}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-forest"><FileText className="size-4" /> Invoice {po.invoiceNumber}</Link>}
          {po.status === "DISPATCHED" && <div className="mt-4"><ActionButton action={buyerDeliveredAction} fields={{ poId: po.id }} variant="primary">Confirm delivery received</ActionButton></div>}
        </Card>
      </div>
    </>
  );
}
