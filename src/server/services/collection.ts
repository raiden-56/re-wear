import type { Prisma } from "@prisma/client";
import { db, transaction } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { safeEqual, sha256 } from "../domain/codes";
import { AppError } from "../domain/errors";
import { assertTransition, BOOKING_TRANSITIONS, type BookingState } from "../domain/state";
import { computeNetGrams, reconcileCategoryWeights, type CategoryWeight } from "../domain/weighing";
import { formatINR } from "@/lib/utils";
import { getSetting } from "../settings";
import { notify } from "./notifications";
import { createPayoutForBooking, autoApproveIfEligible } from "./payouts";
import { onBookingCompleted } from "./rewards";
import { createValuation, respondToValuation, sendValuationApprovalCode, verifyValuationCode } from "./valuation";

/** Collectors can only act on bookings actively assigned to them. Rates/payouts are never editable here. */
async function loadAssigned(actor: Actor, bookingId: string) {
  assertPermission(actor, "pickup:execute");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { assignments: { where: { active: true }, include: { collector: true } }, customer: true },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Pickup not found.");
  const a = booking.assignments[0];
  if (!a || a.collector.userId !== actor.id) throw new AppError("FORBIDDEN", "This pickup is not assigned to you.");
  return { booking, collector: a.collector };
}

async function move(actor: Actor, bookingId: string, from: string, to: BookingState, type: Prisma.PickupEventCreateInput["type"], extra: { note?: string; lat?: number; lng?: number } = {}) {
  await transaction(async (tx) => {
    assertTransition(BOOKING_TRANSITIONS, from as BookingState, to, "pickup");
    const r = await tx.booking.updateMany({ where: { id: bookingId, status: from as BookingState }, data: { status: to } });
    if (r.count !== 1) throw new AppError("CONFLICT", "The pickup changed — please refresh.");
    await tx.pickupEvent.create({ data: { bookingId, type, actorId: actor.id, note: extra.note, latitude: extra.lat, longitude: extra.lng } });
    await audit(tx, actor, `pickup.${type.toLowerCase()}`, "Booking", bookingId, { before: { status: from }, after: { status: to } });
  });
}

export async function startTrip(actor: Actor, bookingId: string) {
  const { booking } = await loadAssigned(actor, bookingId);
  await move(actor, bookingId, booking.status, "EN_ROUTE", "EN_ROUTE");
  await notify(booking.customerId, { title: "Your collector is on the way", body: `Booking ${booking.code}. Keep your clothes ready — pickup is free.`, link: `/app/bookings/${booking.id}`, channels: ["IN_APP", "WHATSAPP"] });
}

/** Doorstep verification with the customer's 4-digit booking code. */
export async function verifyArrival(actor: Actor, bookingId: string, code: string, coords?: { lat?: number; lng?: number }) {
  const { booking } = await loadAssigned(actor, bookingId);
  if (booking.status !== "EN_ROUTE") throw new AppError("INVALID_STATE", "Start the trip before verifying arrival.");
  if (!/^\d{4}$/.test(code) || !safeEqual(sha256(code), booking.pickupOtpHash)) throw new AppError("VALIDATION", "Incorrect booking code. Ask the customer to check their ReWear app.");
  await transaction(async (tx) => {
    await tx.pickupEvent.create({ data: { bookingId, type: "ARRIVED", actorId: actor.id, latitude: coords?.lat, longitude: coords?.lng } });
  });
  await move(actor, bookingId, "EN_ROUTE", "IN_PROGRESS", "OTP_VERIFIED", coords);
}

export async function recordWeighing(
  actor: Actor,
  args: { bookingId: string; grossGrams: number; tareGrams: number; categoryWeights: CategoryWeight[]; rejectedGrams: number; scalePhotoKey?: string | null; evidenceKeys?: string[] },
) {
  assertPermission(actor, "weighing:record");
  const { booking } = await loadAssigned(actor, args.bookingId);
  if (!["IN_PROGRESS", "AWAITING_APPROVAL"].includes(booking.status)) throw new AppError("INVALID_STATE", "Verify the booking code before weighing.");
  if (!args.scalePhotoKey) throw new AppError("VALIDATION", "A photo of the digital scale reading is required.");
  const policy = await getSetting("valuation");
  const net = computeNetGrams(args.grossGrams, args.tareGrams);
  reconcileCategoryWeights(net, args.categoryWeights, args.rejectedGrams, policy.weightToleranceGrams);

  const result = await transaction(async (tx) => {
    const w = await tx.weighingRecord.create({
      data: {
        bookingId: booking.id,
        recordedById: actor.id,
        grossGrams: args.grossGrams,
        tareGrams: args.tareGrams,
        netGrams: net,
        categoryWeights: args.categoryWeights as unknown as Prisma.InputJsonValue,
        rejectedGrams: args.rejectedGrams,
        scalePhotoKey: args.scalePhotoKey,
        evidenceKeys: args.evidenceKeys ?? [],
        location: "doorstep",
      },
    });
    await tx.pickupEvent.create({ data: { bookingId: booking.id, type: "WEIGHED", actorId: actor.id, meta: { grossGrams: args.grossGrams, tareGrams: args.tareGrams, netGrams: net } } });
    await audit(tx, actor, "pickup.weigh", "WeighingRecord", w.id, { after: { gross: args.grossGrams, tare: args.tareGrams, net, weights: args.categoryWeights } });
    if (booking.channel === "DONATION") return { valuation: null };
    const v = await createValuation(tx, actor, { booking, weighingId: w.id, weights: args.categoryWeights, grossGrams: args.grossGrams, tareGrams: args.tareGrams, netGrams: net, source: "DOORSTEP" });
    if (booking.status !== "AWAITING_APPROVAL") await tx.booking.update({ where: { id: booking.id }, data: { status: "AWAITING_APPROVAL" } });
    await tx.pickupEvent.create({ data: { bookingId: booking.id, type: "VALUATION_SENT", actorId: actor.id, meta: { version: v.version, payablePaise: v.payablePaise } } });
    return { valuation: v };
  });
  if (result.valuation) {
    await sendValuationApprovalCode(booking.id, booking.customer.phone, formatINR(result.valuation.payablePaise));
    await notify(booking.customerId, {
      title: "Approve your valuation",
      body: `${(net / 1000).toFixed(2)} kg net · ${formatINR(result.valuation.payablePaise)} payable for ${booking.code}.`,
      link: `/app/bookings/${booking.id}`,
    });
  }
  return result;
}

/** Customer approves at the doorstep by reading out the code sent to their phone. */
export async function captureDoorstepApproval(actor: Actor, bookingId: string, code: string) {
  const { booking } = await loadAssigned(actor, bookingId);
  if (booking.status !== "AWAITING_APPROVAL") throw new AppError("INVALID_STATE", "No valuation awaiting approval.");
  if (!booking.customer.phone) throw new AppError("VALIDATION", "Customer has no phone on file; they must approve in the app.");
  await verifyValuationCode(booking.id, booking.customer.phone, code);
  const latest = await db.valuation.findFirst({ where: { bookingId, status: "PENDING" }, orderBy: { version: "desc" } });
  if (!latest) throw new AppError("INVALID_STATE", "No pending valuation.");
  return respondToValuation(actor, { bookingId, valuationId: latest.id, decision: "APPROVE", method: "DOORSTEP_OTP", onBehalfOfCustomer: true });
}

export async function resendApprovalCode(actor: Actor, bookingId: string) {
  const { booking } = await loadAssigned(actor, bookingId);
  const latest = await db.valuation.findFirst({ where: { bookingId, status: "PENDING" }, orderBy: { version: "desc" } });
  if (!latest) throw new AppError("INVALID_STATE", "No pending valuation.");
  await sendValuationApprovalCode(bookingId, booking.customer.phone, formatINR(latest.payablePaise));
}

/** Hand-over complete: clothes are on the vehicle. Creates the payout (paid channels). */
export async function completePickup(actor: Actor, bookingId: string, evidenceKeys: string[] = []) {
  const { booking, collector } = await loadAssigned(actor, bookingId);
  const isDonation = booking.channel === "DONATION";
  if (isDonation) {
    if (booking.status !== "IN_PROGRESS") throw new AppError("INVALID_STATE", "Weigh the donation before completing.");
    const w = await db.weighingRecord.findFirst({ where: { bookingId }, orderBy: { createdAt: "desc" } });
    if (!w) throw new AppError("INVALID_STATE", "Weigh the donation before completing.");
  } else if (booking.status !== "APPROVED") {
    throw new AppError("INVALID_STATE", "The customer must approve the valuation before completing the pickup.");
  }
  await transaction(async (tx) => {
    const from = booking.status as BookingState;
    const r = await tx.booking.updateMany({ where: { id: bookingId, status: from }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (r.count !== 1) throw new AppError("CONFLICT", "The pickup changed — please refresh.");
    await tx.pickupEvent.create({ data: { bookingId, type: "COMPLETED", actorId: actor.id, meta: { evidenceKeys, collectorId: collector.id } } });
    if (isDonation) {
      const w = await tx.weighingRecord.findFirstOrThrow({ where: { bookingId }, orderBy: { createdAt: "desc" } });
      await tx.donation.update({ where: { bookingId }, data: { status: "COLLECTED", collectedGrams: w.netGrams - w.rejectedGrams } });
    } else {
      await createPayoutForBooking(tx, bookingId, actor);
    }
    await audit(tx, actor, "pickup.complete", "Booking", bookingId, { before: { status: from }, after: { status: "COMPLETED" } });
  });
  await onBookingCompleted(bookingId);
  if (!isDonation) await autoApproveIfEligible(bookingId);
  await notify(booking.customerId, {
    title: isDonation ? "Thank you for donating" : "Pickup complete",
    body: isDonation ? `Your donation ${booking.code} is on its way to our NGO partner.` : `Booking ${booking.code} is complete. Your UPI payout is being processed.`,
    link: `/app/bookings/${booking.id}`,
    channels: ["IN_APP", "WHATSAPP"],
  });
}
