import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { adminCounterAction, cancelPoAction, confirmPoAction, dispatchPoAction, poPaidAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, KeyValue, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { Negotiation } from "@/components/b2b/negotiation";
import { businessTypeLabel, gradeLabel, poStatus } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export default async function AdminPO({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const po = await db.purchaseOrder.findUnique({ where: { id: (await params).id }, include: { business: true, listing: { include: { category: true } }, offers: { orderBy: { createdAt: "asc" } } } });
  if (!po) notFound();
  const last = po.offers[po.offers.length - 1];
  return (
    <>
      <Link href="/admin/b2b" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> B2B</Link>
      <PageHeader title={<span className="num">{po.code}</span>} description={`${po.business.legalName} · ${businessTypeLabel[po.business.businessType]}`} actions={<StatusBadge map={poStatus} value={po.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Negotiation" />
          <div className="space-y-4 p-5">
            <Negotiation offers={po.offers} viewerSide="REWEAR" />
            {["REQUESTED", "NEGOTIATING"].includes(po.status) && (
              <>
                <ActionForm action={adminCounterAction} className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <input type="hidden" name="poId" value={po.id} />
                  <Input name="price" type="number" step="0.5" placeholder="₹/kg" defaultValue={(last?.pricePerKgPaise ?? po.listPricePerKgPaise) / 100} className="w-28" />
                  <Input name="kg" type="number" defaultValue={po.requestedGrams / 1000} className="w-24" />
                  <Input name="message" placeholder="Message" className="min-w-40 flex-1" />
                  <SubmitButton variant="secondary">Counter</SubmitButton>
                </ActionForm>
                <div className="flex gap-2">
                  <ActionButton action={confirmPoAction} fields={{ poId: po.id }} variant="primary" size="md">Confirm at {formatINR(last?.pricePerKgPaise ?? po.listPricePerKgPaise)}/kg</ActionButton>
                  <ActionForm action={cancelPoAction} className="flex gap-1"><input type="hidden" name="poId" value={po.id} /><Input name="reason" placeholder="Reason" className="h-10 w-36" /><SubmitButton variant="ghost">Decline</SubmitButton></ActionForm>
                </div>
              </>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <KeyValue items={[
              ["Listing", po.listing.title],
              ["Grade", gradeLabel[po.listing.grade].label],
              ["Quantity", formatKg(po.requestedGrams, 0)],
              ["List price", `${formatINR(po.listPricePerKgPaise)}/kg`],
              ["Agreed price", po.agreedPricePerKgPaise ? `${formatINR(po.agreedPricePerKgPaise)}/kg` : "—"],
              ["Total", po.totalPaise ? formatINR(po.totalPaise) : "—"],
              ["Invoice", po.invoiceNumber ?? "—"],
              ["Payment", po.paymentStatus.toLowerCase()],
              ["Delivery to", po.deliveryAddress ?? "—"],
              ["Tracking", po.trackingNumber ? `${po.courier} ${po.trackingNumber}` : "—"],
              ["Confirmed", formatDate(po.confirmedAt)],
            ]} />
            {po.invoiceNumber && <Link href={`/receipts/invoice/${po.code}`} className="mt-3 inline-flex items-center gap-1 text-sm text-forest"><FileText className="size-4" /> Tax invoice</Link>}
          </Card>
          {po.status === "CONFIRMED" && (
            <Card className="p-5">
              <ActionForm action={dispatchPoAction} className="space-y-2"><input type="hidden" name="poId" value={po.id} /><Input name="courier" placeholder="Courier / fleet" /><Input name="trackingNumber" placeholder="Tracking / LR number" /><SubmitButton>Dispatch</SubmitButton></ActionForm>
            </Card>
          )}
          {po.invoiceNumber && po.paymentStatus !== "CAPTURED" && <Card className="p-5"><ActionButton action={poPaidAction} fields={{ poId: po.id }} variant="primary" size="md">Record payment received</ActionButton></Card>}
        </div>
      </div>
    </>
  );
}
