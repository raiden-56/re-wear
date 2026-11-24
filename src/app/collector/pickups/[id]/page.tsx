import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, MessageCircle, Navigation, Phone, RefreshCw, Truck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { doorstepApprovalAction, failPickupAction, resendCodeAction, startTripAction } from "@/app/actions/collector";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Notice, StatusBadge } from "@/components/ui/primitives";
import { WeighingForm } from "@/components/collector/weighing-form";
import { ArrivalForm } from "@/components/collector/arrival-form";
import { CompleteForm } from "@/components/collector/complete-form";
import { ValuationBreakdown } from "@/components/booking/valuation-breakdown";
import { Timeline } from "@/components/booking/timeline";
import { bookingStatus, channelLabel } from "@/lib/labels";
import { formatDay, formatKg } from "@/lib/utils";

const FAIL_REASONS = ["Customer not available", "Customer cancelled at door", "Address not found", "Clothes not ready", "Unsafe / access denied", "Vehicle breakdown"];

export default async function CollectorPickup({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["COLLECTOR"]);
  const { id } = await params;
  const b = await db.booking.findFirst({
    where: { id, assignments: { some: { active: true, collector: { userId: user.id } } } },
    include: {
      slot: true,
      address: true,
      customer: { select: { name: true, phone: true } },
      items: { include: { category: true } },
      events: { orderBy: { createdAt: "asc" } },
      valuations: { orderBy: { version: "desc" }, take: 1 },
      weighings: { orderBy: { createdAt: "desc" }, take: 1 },
      donationPartner: true,
    },
  });
  if (!b) notFound();
  const [allCats, policy] = await Promise.all([db.clothingCategory.findMany({ where: { active: true, accepted: true }, orderBy: { sortOrder: "asc" } }), getSetting("valuation")]);
  const v = b.valuations[0];
  const w = b.weighings[0];
  const maps = b.address.latitude && b.address.longitude ? `https://www.google.com/maps/dir/?api=1&destination=${b.address.latitude},${b.address.longitude}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${b.address.line1}, ${b.address.line2 ?? ""}, ${b.address.city} ${b.address.pincode}`)}`;
  const isDonation = b.channel === "DONATION";
  const needsWeighing = b.status === "IN_PROGRESS" && !(isDonation && w);
  const contactPhone = b.address.contactPhone || b.customer.phone;

  return (
    <div className="space-y-4">
      <Link href="/collector" className="inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Today</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="num text-xl font-bold">{b.code}</h1>
          <p className="text-sm text-muted">{formatDay(b.pickupDate)} · {b.slot.label} · {channelLabel[b.channel]}</p>
        </div>
        <StatusBadge map={bookingStatus} value={b.status} />
      </div>

      <Card className="p-4">
        <div className="font-semibold">{b.address.contactName}</div>
        <div className="mt-1 flex gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" /> {b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ""}{b.address.landmark ? ` (near ${b.address.landmark})` : ""}, {b.address.city} {b.address.pincode}</div>
        {b.instructions && <p className="mt-2 rounded-xl bg-amber-100 p-2.5 text-sm">{b.instructions}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {contactPhone && <Button asChild variant="secondary" size="sm"><a href={`tel:${contactPhone}`}><Phone /> Call</a></Button>}
          {contactPhone && <Button asChild variant="secondary" size="sm"><a href={`https://wa.me/${contactPhone.replace("+", "")}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>}
          <Button asChild variant="secondary" size="sm"><a href={maps} target="_blank" rel="noreferrer"><Navigation /> Navigate</a></Button>
        </div>
        <div className="mt-3 text-xs text-muted">Expected: ~{formatKg(b.estimatedGrams, 0)} · {b.bagCount} bag{b.bagCount > 1 ? "s" : ""} · {b.items.map((i) => i.category.name).join(", ")}</div>
        {isDonation && b.donationPartner && <div className="mt-1 text-xs font-medium text-forest">Donation for {b.donationPartner.name} — no payment</div>}
        {b.photoKeys.length > 0 && <div className="mt-3 flex gap-2">{b.photoKeys.map((k) => <a key={k} href={`/api/files/${k}`} target="_blank" className="block size-14 overflow-hidden rounded-lg border border-line">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/files/${k}`} alt="Customer photo" className="size-full object-cover" /></a>)}</div>}
      </Card>

      {b.status === "ASSIGNED" && (
        <Card className="p-4">
          <ActionButton action={startTripAction} fields={{ bookingId: b.id }} variant="primary" size="lg" className="w-full [&>button]:w-full"><Truck /> Start trip</ActionButton>
        </Card>
      )}

      {b.status === "EN_ROUTE" && <Card className="p-4"><ArrivalForm bookingId={b.id} /></Card>}

      {needsWeighing && (
        <Card>
          <CardHeader title="Weigh the clothes" description="Use the calibrated scale. Weigh empty bags for tare." />
          <div className="p-4"><WeighingForm bookingId={b.id} initialCats={b.items.map((i) => ({ id: i.categoryId, name: i.category.name }))} allCats={allCats.map((c) => ({ id: c.id, name: c.name }))} tolerance={policy.weightToleranceGrams} /></div>
        </Card>
      )}

      {b.status === "AWAITING_APPROVAL" && v && (
        <Card>
          <CardHeader title="Customer approval" description="The customer can approve in their app, or read you the 6-digit code we texted them." />
          <div className="space-y-4 p-4">
            <ValuationBreakdown v={v} rejectedGrams={w?.rejectedGrams ?? 0} />
            <ActionForm action={doorstepApprovalAction} className="space-y-2">
              <input type="hidden" name="bookingId" value={b.id} />
              <Input name="code" inputMode="numeric" maxLength={6} placeholder="6-digit approval code" className="num h-12 text-center text-xl tracking-[0.4em]" aria-label="Approval code" />
              <SubmitButton size="lg" className="w-full">Confirm customer approval</SubmitButton>
            </ActionForm>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={resendCodeAction} fields={{ bookingId: b.id }}>Resend code</ActionButton>
              <Button asChild variant="ghost" size="sm"><Link href={`/collector/pickups/${b.id}`}><RefreshCw /> Check for in-app approval</Link></Button>
            </div>
          </div>
        </Card>
      )}

      {(b.status === "APPROVED" || (isDonation && b.status === "IN_PROGRESS" && w)) && (
        <Card>
          <CardHeader title={isDonation ? "Donation weighed" : "Valuation approved"} description={isDonation ? `${formatKg(w!.netGrams - w!.rejectedGrams)} accepted` : "Load the bags and complete the pickup."} />
          <div className="p-4"><CompleteForm bookingId={b.id} /></div>
        </Card>
      )}

      {b.status === "DISPUTED" && <Notice tone="warn" title="Customer disputed the valuation">Do not take the clothes unless the support team instructs you to.</Notice>}
      {b.status === "RETURNED" && <Notice tone="info" title="Clothes stay with the customer">The customer rejected the valuation at the doorstep.</Notice>}

      {["ASSIGNED", "EN_ROUTE", "IN_PROGRESS"].includes(b.status) && (
        <details className="rounded-2xl border border-line bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-danger">Can't complete this pickup?</summary>
          <ActionForm action={failPickupAction} className="mt-3 space-y-2">
            <input type="hidden" name="bookingId" value={b.id} />
            <Select name="reason" defaultValue="">{["", ...FAIL_REASONS].map((r) => <option key={r} value={r} disabled={!r}>{r || "Choose a reason"}</option>)}</Select>
            <SubmitButton variant="danger" size="sm">Mark as failed</SubmitButton>
          </ActionForm>
        </details>
      )}

      <Card>
        <CardHeader title="Activity" />
        <div className="p-4"><Timeline events={b.events} /></div>
      </Card>
    </div>
  );
}
