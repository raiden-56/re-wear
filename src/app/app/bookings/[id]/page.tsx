import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, KeyRound, MapPin, Phone, Receipt, Truck, UserRound } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { pickupCode } from "@/server/services/booking";
import { getSetting } from "@/server/settings";
import { cancelBookingAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Card, CardHeader, KeyValue, Notice, StatusBadge } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { BookingProgress } from "@/components/customer/booking-progress";
import { ValuationBreakdown } from "@/components/booking/valuation-breakdown";
import { ValuationDecision } from "@/components/customer/valuation-decision";
import { RescheduleDialog } from "@/components/customer/reschedule-form";
import { Timeline } from "@/components/booking/timeline";
import { SuccessBurst } from "@/components/success-burst";
import { bookingStatus, channelLabel, donationStatus, payoutStatus } from "@/lib/labels";
import { addDays, todayIST } from "@/lib/dates";
import { formatDate, formatDay, formatINR, formatKg, maskPhone, maskVpa } from "@/lib/utils";

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole(["CUSTOMER"]);
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const b = await db.booking.findFirst({
    where: { id, customerId: user.id },
    include: {
      slot: true,
      address: true,
      items: { include: { category: true } },
      events: { orderBy: { createdAt: "asc" } },
      valuations: { orderBy: { version: "desc" } },
      weighings: { orderBy: { createdAt: "desc" } },
      assignments: { where: { active: true }, include: { collector: { include: { user: true } } } },
      payout: true,
      donation: { include: { partner: true } },
      tickets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!b) notFound();
  const policy = await getSetting("valuation");
  const pending = b.valuations.find((v) => v.status === "PENDING");
  const current = pending ?? b.valuations.find((v) => v.status === "APPROVED");
  const weighing = current ? b.weighings.find((w) => w.id === current.weighingId) : b.weighings[0];
  const collector = b.assignments[0]?.collector;
  const mutable = ["SCHEDULED", "ASSIGNED"].includes(b.status);
  const showCode = ["SCHEDULED", "ASSIGNED", "EN_ROUTE"].includes(b.status);
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayIST(), i)).map((d) => ({ value: d, label: formatDay(new Date(d + "T00:00:00Z")) }));

  return (
    <div className="space-y-5">
      <Link href="/app/bookings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-charcoal"><ArrowLeft className="size-4" /> My pickups</Link>
      {isNew && <SuccessBurst title="Free pickup confirmed!" subtitle={`Booking ${b.code} · ${formatDay(b.pickupDate)}, ${b.slot.label}`} />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{channelLabel[b.channel]}</div>
          <h1 className="num text-2xl font-bold">{b.code}</h1>
          <div className="mt-1 text-sm text-muted">{formatDay(b.pickupDate)} · {b.slot.label}</div>
        </div>
        <StatusBadge map={bookingStatus} value={b.status} />
      </div>

      <Card className="p-5">
        <BookingProgress status={b.status} />
      </Card>

      {pending && (
        <Card className="border-2 border-amber">
          <CardHeader title="Review and approve your valuation" description="Check the weights and rates below. Nothing is final until you approve." />
          <div className="space-y-5 p-5">
            <ValuationBreakdown v={pending} rejectedGrams={weighing?.rejectedGrams ?? 0} />
            {weighing?.scalePhotoKey && (
              <a href={`/api/files/${weighing.scalePhotoKey}`} target="_blank" className="inline-flex items-center gap-2 text-sm font-medium text-forest underline">View the scale photo</a>
            )}
            <ValuationDecision bookingId={b.id} valuationId={pending.id} rejectionFlow={pending.source === "DOORSTEP" ? policy.rejectionFlow : "DISPUTE"} />
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          {showCode && (
            <Card className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-amber-100"><KeyRound className="size-5 text-[#7a5317]" /></span>
                <div><div className="font-semibold">Doorstep booking code</div><div className="text-sm text-muted">Share only with your ReWear collector when they arrive.</div></div>
              </div>
              <div className="num rounded-xl bg-cream px-4 py-2 font-display text-3xl font-extrabold tracking-[0.3em]">{pickupCode(b.code)}</div>
            </Card>
          )}

          {!pending && current && (
            <Card>
              <CardHeader title="Final valuation" description={current.approvedAt ? `Approved ${formatDate(current.approvedAt, true)} (${current.approvalMethod === "DOORSTEP_OTP" ? "doorstep code" : "in app"})` : undefined} />
              <div className="p-5"><ValuationBreakdown v={current} rejectedGrams={weighing?.rejectedGrams ?? 0} /></div>
            </Card>
          )}

          {b.payout && (
            <Card>
              <CardHeader title="UPI payment" action={<StatusBadge map={payoutStatus} value={b.payout.status} />} />
              <div className="p-5">
                <KeyValue items={[
                  ["Amount", formatINR(b.payout.amountPaise)],
                  ["UPI ID", b.payout.upiVpa ? maskVpa(b.payout.upiVpa) : <Link href="/app/payments" className="text-forest underline">Add UPI ID</Link>],
                  ["Reference", b.payout.code],
                  ...(b.payout.utr ? [["Bank UTR", b.payout.utr] as [string, string]] : []),
                  ...(b.payout.completedAt ? [["Paid on", formatDate(b.payout.completedAt, true)] as [string, string]] : []),
                ]} />
                {b.payout.status === "SUCCESSFUL" && <Link href={`/receipts/payout/${b.payout.code}`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-forest"><Receipt className="size-4" /> Download receipt</Link>}
              </div>
            </Card>
          )}

          {b.donation && (
            <Card>
              <CardHeader title={`Donation to ${b.donation.partner.name}`} action={<StatusBadge map={donationStatus} value={b.donation.status} />} />
              <div className="p-5">
                <KeyValue items={[["Donation ID", b.donation.code], ["Weight", b.donation.collectedGrams ? formatKg(b.donation.collectedGrams) : "Weighed at pickup"], ["Receipt no.", b.donation.receiptNumber ?? "Issued on hand-over"]]} />
                {b.donation.acknowledgement && <blockquote className="mt-3 rounded-xl bg-cream p-3 text-sm italic">“{b.donation.acknowledgement}” — {b.donation.partner.name}</blockquote>}
                {b.donation.receiptNumber && <Link href={`/receipts/donation/${b.donation.code}`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-forest"><FileText className="size-4" /> Donation receipt</Link>}
              </div>
            </Card>
          )}

          {b.status === "DISPUTED" && <Notice tone="warn" title="Under review">Our team is reviewing this valuation with the scale photos. You'll hear from us within one working day. {b.tickets[0] && <Link href={`/app/support/${b.tickets[0].id}`} className="font-semibold underline">View ticket {b.tickets[0].code}</Link>}</Notice>}
          {b.status === "FAILED" && <Notice tone="danger" title="We missed this pickup">{b.failureReason}. Book again — it's free.</Notice>}

          <Card>
            <CardHeader title="Pickup progress" />
            <div className="p-5"><Timeline events={b.events} /></div>
          </Card>
        </div>

        <div className="space-y-5">
          {collector && (
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-forest-50"><UserRound className="size-5 text-forest" /></span>
                <div className="flex-1"><div className="font-semibold">{collector.user.name}</div><div className="text-xs text-muted">ReWear collector · {collector.employeeCode}{collector.vehicleNumber ? ` · ${collector.vehicleNumber}` : ""}</div></div>
                {collector.user.phone && ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL"].includes(b.status) && <a href={`tel:${collector.user.phone}`} className="rounded-full bg-forest p-2.5 text-white" aria-label="Call collector"><Phone className="size-4" /></a>}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Details" />
            <div className="p-5">
              <KeyValue items={[
                ["Estimated weight", `${formatKg(b.estimatedGrams, 1)} · ${b.bagCount} bag${b.bagCount > 1 ? "s" : ""}`],
                ...(b.channel !== "DONATION" ? [["Estimate at booking", formatINR(b.estimatedPaise)] as [string, string]] : []),
                ["Pickup charge", <span key="f" className="font-semibold text-forest">FREE</span>],
                ["Categories", b.items.map((i) => i.category.name).join(", ")],
              ]} />
              <div className="mt-4 flex gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-forest" /><span>{b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ""}, {b.address.city} {b.address.pincode}</span></div>
              {b.instructions && <p className="mt-3 rounded-xl bg-cream p-3 text-sm">{b.instructions}</p>}
              {b.channel !== "DONATION" && <p className="mt-3 text-xs text-muted">Rates locked at booking: {b.items.map((i) => `${i.category.name} ${formatINR(i.ratePaisePerKg)}/kg`).join(" · ")}</p>}
            </div>
          </Card>
          {mutable && (
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-2 font-semibold"><Truck className="size-4 text-forest" /> Change of plans?</div>
              <RescheduleDialog bookingId={b.id} addressId={b.addressId} days={days} />
              <ActionForm action={cancelBookingAction} className="space-y-2">
                <input type="hidden" name="bookingId" value={b.id} />
                <Input name="reason" placeholder="Reason for cancelling" aria-label="Reason for cancelling" />
                <SubmitButton variant="ghost" size="sm" className="text-danger">Cancel pickup</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Link href={`/app/support?bookingId=${b.id}`} className="block text-center text-sm font-medium text-forest">Need help with this pickup?</Link>
        </div>
      </div>
    </div>
  );
}
