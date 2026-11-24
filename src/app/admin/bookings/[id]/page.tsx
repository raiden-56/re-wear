import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { adminCancelAction, adminFailAction, assignAction, autoAssignAction, resolveDisputeAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input, Select } from "@/components/ui/form";
import { Card, CardHeader, KeyValue, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ValuationBreakdown } from "@/components/booking/valuation-breakdown";
import { Timeline } from "@/components/booking/timeline";
import { bookingStatus, channelLabel, payoutStatus } from "@/lib/labels";
import { formatDate, formatDay, formatINR, formatKg, maskPhone, titleCase } from "@/lib/utils";

export default async function AdminBookingDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const b = await db.booking.findUnique({
    where: { id: (await params).id },
    include: { customer: true, address: true, slot: true, serviceArea: true, items: { include: { category: true } }, events: { orderBy: { createdAt: "asc" } }, valuations: { orderBy: { version: "desc" } }, weighings: { orderBy: { createdAt: "desc" } }, assignments: { orderBy: { assignedAt: "desc" }, include: { collector: { include: { user: true } } } }, payout: true, batch: true, donation: { include: { partner: true } }, tickets: true },
  });
  if (!b) notFound();
  const collectors = await db.collectorProfile.findMany({ where: { serviceAreaId: b.serviceAreaId, active: true }, include: { user: true } });
  const active = b.assignments.find((a) => a.active);
  return (
    <>
      <Link href="/admin/bookings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Bookings</Link>
      <PageHeader title={<span className="num">{b.code}</span>} description={`${channelLabel[b.channel]} · ${formatDay(b.pickupDate)} ${b.slot.label} · ${b.serviceArea.name}`} actions={<StatusBadge map={bookingStatus} value={b.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {b.valuations.map((v) => {
            const w = b.weighings.find((x) => x.id === v.weighingId);
            return (
              <Card key={v.id}>
                <CardHeader title={`Valuation v${v.version} · ${titleCase(v.status)}`} description={`${titleCase(v.source)} · ${formatDate(v.createdAt, true)}${v.approvedAt ? ` · approved ${formatDate(v.approvedAt, true)} via ${v.approvalMethod}` : ""}${v.rejectionReason ? ` · rejected: ${v.rejectionReason}` : ""}`} />
                <div className="p-5">
                  <ValuationBreakdown v={v} rejectedGrams={w?.rejectedGrams ?? 0} />
                  {w?.scalePhotoKey && <a href={`/api/files/${w.scalePhotoKey}`} target="_blank" className="mt-3 inline-block text-sm text-forest underline">Scale photo</a>}
                  {w?.evidenceKeys.map((k, i) => <a key={k} href={`/api/files/${k}`} target="_blank" className="ml-3 mt-3 inline-block text-sm text-forest underline">Evidence {i + 1}</a>)}
                </div>
              </Card>
            );
          })}
          {b.status === "DISPUTED" && (
            <Card className="border-amber">
              <CardHeader title="Resolve dispute" description="Or issue a revised valuation from the warehouse batch page." />
              <ActionForm action={resolveDisputeAction} className="space-y-3 p-5">
                <input type="hidden" name="bookingId" value={b.id} />
                <Select name="outcome"><option value="REINSTATE_PREVIOUS">Reinstate previously approved valuation</option><option value="RETURN">Return clothes to the customer</option></Select>
                <Input name="note" placeholder="Note to the customer" />
                <SubmitButton>Resolve</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card><CardHeader title="Timeline & audit trail" /><div className="p-5"><Timeline events={b.events} /></div></Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <KeyValue items={[
              ["Customer", <Link key="c" href={`/admin/customers/${b.customerId}`} className="text-forest underline">{b.customer.name}</Link>],
              ["Phone", maskPhone(b.customer.phone)],
              ["Address", `${b.address.line1}, ${b.address.pincode}`],
              ["Estimate", `${formatKg(b.estimatedGrams, 1)} · ${formatINR(b.estimatedPaise)}`],
              ["Pickup fee", "₹0 (free)"],
              ["Categories", b.items.map((i) => `${i.category.name} @ ${formatINR(i.ratePaisePerKg)}`).join(", ")],
              ["Batch", b.batch ? <Link key="bt" href={`/warehouse/batches/${b.batch.id}`} className="text-forest underline">{b.batch.code}</Link> : "—"],
              ["Payout", b.payout ? <span key="p"><Link href={`/admin/payments/${b.payout.id}`} className="text-forest underline">{b.payout.code}</Link> · <StatusBadge map={payoutStatus} value={b.payout.status} /></span> : "—"],
              ...(b.donation ? [["Donation", `${b.donation.partner.name} · ${b.donation.status}`] as [string, string]] : []),
            ]} />
          </Card>
          <Card>
            <CardHeader title="Collector" description={active ? `${active.collector.user.name} · ${active.collector.employeeCode}` : "Not assigned"} />
            <div className="space-y-3 p-5">
              {["SCHEDULED", "ASSIGNED"].includes(b.status) && (
                <>
                  <ActionForm action={assignAction} className="flex gap-2">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Select name="collectorId" defaultValue={active?.collectorId}>{collectors.map((c) => <option key={c.id} value={c.id}>{c.user.name} ({c.dailyCapacity}/day)</option>)}</Select>
                    <SubmitButton>{active ? "Reassign" : "Assign"}</SubmitButton>
                  </ActionForm>
                  {!active && <ActionButton action={autoAssignAction} fields={{ bookingId: b.id }}>Auto-assign by capacity</ActionButton>}
                </>
              )}
              {b.assignments.length > 1 && <p className="text-xs text-muted">History: {b.assignments.map((a) => a.collector.user.name).join(" → ")}</p>}
            </div>
          </Card>
          {["SCHEDULED", "ASSIGNED", "EN_ROUTE"].includes(b.status) && (
            <Card className="space-y-3 p-5">
              <ActionForm action={adminCancelAction} className="flex gap-2"><input type="hidden" name="bookingId" value={b.id} /><Input name="reason" placeholder="Cancellation reason" /><SubmitButton variant="secondary">Cancel</SubmitButton></ActionForm>
              <ActionForm action={adminFailAction} className="flex gap-2"><input type="hidden" name="bookingId" value={b.id} /><Input name="reason" placeholder="Failure reason" /><SubmitButton variant="danger">Mark failed</SubmitButton></ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
