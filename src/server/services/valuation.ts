import type { Prisma } from "@prisma/client";
import { db, transaction, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission, can } from "../auth/guard";
import { hmacSha256, humanCode, numericCode, safeEqual } from "../domain/codes";
import { AppError } from "../domain/errors";
import { assertTransition, BOOKING_TRANSITIONS, type BookingState } from "../domain/state";
import { buildValuation, type Deduction, type RateLine } from "../domain/valuation";
import { computeNetGrams, reconcileCategoryWeights, type CategoryWeight } from "../domain/weighing";
import { env } from "../env";
import { sendSms } from "../providers/messaging";
import { getSetting } from "../settings";
import { notify } from "./notifications";
import { resolveRates } from "./pricing";
import { syncPayoutWithValuation } from "./payouts";

type Snapshot = { rates: { categoryId: string; name: string; ratePaisePerKg: number; pricingRuleId: string | null }[]; city?: string; serviceAreaId?: string };

/**
 * Rates for a valuation come from the booking's pricing snapshot (locked at confirmation).
 * A category that was not in the original booking is priced at the live rate at weighing time,
 * and that rate is itself recorded on the valuation line.
 */
export async function ratesForBooking(tx: Tx, booking: { channel: Prisma.BookingGetPayload<object>["channel"]; pricingSnapshot: unknown; serviceAreaId: string }, weights: CategoryWeight[]) {
  const snap = booking.pricingSnapshot as Snapshot;
  const byCat = new Map(snap.rates.map((r) => [r.categoryId, r]));
  const missing = weights.map((w) => w.categoryId).filter((id) => !byCat.has(id));
  const cats = await tx.clothingCategory.findMany({ where: { id: { in: weights.map((w) => w.categoryId) } } });
  const names = new Map(cats.map((c) => [c.id, c.name]));
  if (cats.length !== weights.length) throw new AppError("VALIDATION", "Unknown clothing category.");
  let live = new Map<string, { id: string; pricePerKgPaise: number } | null>();
  if (missing.length && booking.channel !== "DONATION") {
    live = await resolveRates({ categoryIds: missing, channel: booking.channel, serviceAreaId: booking.serviceAreaId, city: snap.city }, tx);
  }
  return weights.map<RateLine>((w) => {
    const s = byCat.get(w.categoryId);
    if (s) return { categoryId: w.categoryId, name: s.name, grams: w.grams, ratePaisePerKg: s.ratePaisePerKg, pricingRuleId: s.pricingRuleId };
    const rule = live.get(w.categoryId);
    if (!rule && booking.channel !== "DONATION") throw new AppError("VALIDATION", `${names.get(w.categoryId)} has no published rate.`);
    return { categoryId: w.categoryId, name: names.get(w.categoryId)!, grams: w.grams, ratePaisePerKg: rule?.pricePerKgPaise ?? 0, pricingRuleId: rule?.id ?? null };
  });
}

const valuationOtpPurpose = (bookingId: string) => `VALUATION:${bookingId}`;

/** Create a new valuation version from a weighing record; supersedes earlier pending versions. */
export async function createValuation(
  tx: Tx,
  actor: Actor,
  args: {
    booking: { id: string; channel: Prisma.BookingGetPayload<object>["channel"]; pricingSnapshot: unknown; serviceAreaId: string };
    weighingId: string;
    weights: CategoryWeight[];
    grossGrams: number;
    tareGrams: number;
    netGrams: number;
    deductions?: Deduction[];
    source: "DOORSTEP" | "WAREHOUSE_REINSPECTION" | "ADMIN_ADJUSTMENT";
  },
) {
  const policy = await getSetting("valuation", tx);
  const lines = await ratesForBooking(tx, args.booking, args.weights.filter((w) => w.grams > 0));
  const v = buildValuation(lines, args.deductions ?? [], {
    deductionsAllowed: policy.deductionsAllowed,
    allowedReasons: policy.allowedDeductionReasons,
    maxDeductionPct: policy.maxDeductionPct,
  });
  const last = await tx.valuation.findFirst({ where: { bookingId: args.booking.id }, orderBy: { version: "desc" } });
  await tx.valuation.updateMany({ where: { bookingId: args.booking.id, status: "PENDING" }, data: { status: "SUPERSEDED" } });
  return tx.valuation.create({
    data: {
      bookingId: args.booking.id,
      weighingId: args.weighingId,
      version: (last?.version ?? 0) + 1,
      source: args.source,
      lines: v.lines as unknown as Prisma.InputJsonValue,
      deductions: v.deductions as unknown as Prisma.InputJsonValue,
      grossGrams: args.grossGrams,
      tareGrams: args.tareGrams,
      netGrams: args.netGrams,
      subtotalPaise: v.subtotalPaise,
      deductionPaise: v.deductionPaise,
      payablePaise: v.payablePaise,
      createdById: actor.id,
    },
  });
}

/** Send the customer a one-time code they can read to the collector to approve at the doorstep. */
export async function sendValuationApprovalCode(bookingId: string, customerPhone: string | null, amountText: string) {
  if (!customerPhone) return;
  const code = numericCode(6);
  await db.otpChallenge.updateMany({ where: { phone: customerPhone, purpose: valuationOtpPurpose(bookingId), consumedAt: null }, data: { consumedAt: new Date() } });
  await db.otpChallenge.create({
    data: {
      phone: customerPhone,
      purpose: valuationOtpPurpose(bookingId),
      codeHash: hmacSha256(env().AUTH_SECRET, `${valuationOtpPurpose(bookingId)}:${customerPhone}:${code}`),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  await sendSms(customerPhone, `ReWear valuation ${amountText}. To approve at your doorstep share code ${code} with the collector, or approve in the app.`, { otp: code });
  return code;
}

export async function verifyValuationCode(bookingId: string, phone: string, code: string) {
  const ch = await db.otpChallenge.findFirst({ where: { phone, purpose: valuationOtpPurpose(bookingId), consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!ch || ch.expiresAt < new Date()) throw new AppError("VALIDATION", "Approval code expired — resend it to the customer.");
  if (ch.attempts >= 5) throw new AppError("RATE_LIMITED", "Too many incorrect codes. Ask the customer to approve in the app.");
  const ok = safeEqual(ch.codeHash, hmacSha256(env().AUTH_SECRET, `${valuationOtpPurpose(bookingId)}:${phone}:${code}`));
  if (!ok) {
    await db.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("VALIDATION", "Incorrect approval code.");
  }
  await db.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
}

/**
 * Customer decision on the latest pending valuation.
 * Records approval timestamp, method and the exact valuation version.
 */
export async function respondToValuation(
  actor: Actor,
  args: { bookingId: string; valuationId: string; decision: "APPROVE" | "REJECT"; reason?: string; method?: "APP" | "DOORSTEP_OTP"; onBehalfOfCustomer?: boolean },
) {
  const booking = await db.booking.findUnique({ where: { id: args.bookingId }, include: { customer: true } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  if (!args.onBehalfOfCustomer) {
    if (booking.customerId !== actor.id) throw new AppError("FORBIDDEN", "Only the customer can respond to this valuation.");
    assertPermission(actor, "valuation:respond");
  }
  const policy = await getSetting("valuation");
  const result = await transaction(async (tx) => {
    const v = await tx.valuation.findUnique({ where: { id: args.valuationId } });
    if (!v || v.bookingId !== booking.id) throw new AppError("NOT_FOUND", "Valuation not found.");
    const latest = await tx.valuation.findFirst({ where: { bookingId: booking.id }, orderBy: { version: "desc" } });
    if (latest?.id !== v.id || v.status !== "PENDING") throw new AppError("INVALID_STATE", "This valuation is no longer awaiting a decision.");

    if (args.decision === "APPROVE") {
      const res = await tx.valuation.updateMany({ where: { id: v.id, status: "PENDING" }, data: { status: "APPROVED", approvedAt: new Date(), approvalMethod: args.method ?? "APP" } });
      if (res.count !== 1) throw new AppError("CONFLICT", "Valuation already decided.");
      await tx.valuation.updateMany({ where: { bookingId: booking.id, id: { not: v.id }, status: "APPROVED" }, data: { status: "SUPERSEDED" } });
      // Doorstep approval → APPROVED (collector then completes). Re-inspection approval → back to COMPLETED.
      const next: BookingState = v.source === "DOORSTEP" ? "APPROVED" : "COMPLETED";
      assertTransition(BOOKING_TRANSITIONS, booking.status as BookingState, next, "booking");
      await tx.booking.update({ where: { id: booking.id }, data: { status: next } });
      await tx.pickupEvent.create({ data: { bookingId: booking.id, type: "VALUATION_APPROVED", actorId: actor.id, meta: { version: v.version, payablePaise: v.payablePaise, method: args.method ?? "APP" } } });
      await audit(tx, actor, "valuation.approve", "Valuation", v.id, { after: { version: v.version, payablePaise: v.payablePaise, method: args.method ?? "APP" } });
      if (next === "COMPLETED") await syncPayoutWithValuation(tx, booking.id, v.id, actor);
      return { status: next, valuation: v };
    }

    await tx.valuation.update({ where: { id: v.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: args.reason?.slice(0, 500) } });
    const atDoorstep = v.source === "DOORSTEP";
    const next: BookingState = atDoorstep && policy.rejectionFlow === "RETURN" ? "RETURNED" : "DISPUTED";
    await tx.booking.update({ where: { id: booking.id }, data: { status: next } });
    await tx.pickupEvent.create({ data: { bookingId: booking.id, type: "VALUATION_REJECTED", actorId: actor.id, note: args.reason, meta: { version: v.version, outcome: next } } });
    if (next === "DISPUTED") {
      await tx.supportTicket.create({
        data: {
          code: humanCode("TK"),
          userId: booking.customerId,
          bookingId: booking.id,
          type: "DISPUTE",
          priority: "HIGH",
          subject: `Valuation v${v.version} disputed for ${booking.code}`,
          messages: { create: { authorId: booking.customerId, body: args.reason || "Customer rejected the valuation." } },
        },
      });
      await tx.payout.updateMany({ where: { bookingId: booking.id, status: { in: ["AWAITING_APPROVAL", "APPROVED"] } }, data: { status: "UNDER_REVIEW" } });
    }
    await audit(tx, actor, "valuation.reject", "Valuation", v.id, { after: { version: v.version, reason: args.reason, outcome: next } });
    return { status: next, valuation: v };
  });
  if (result.status === "COMPLETED") {
    const { autoApproveIfEligible } = await import("./payouts");
    await autoApproveIfEligible(booking.id);
  }
  return result;
}

/** Warehouse re-inspection or admin adjustment: issue a revised valuation that the customer must approve. */
export async function reviseValuation(
  actor: Actor,
  args: { bookingId: string; grossGrams: number; tareGrams: number; categoryWeights: CategoryWeight[]; rejectedGrams: number; deductions?: Deduction[]; reason: string; evidenceKeys?: string[] },
) {
  assertPermission(actor, "valuation:revise");
  const booking = await db.booking.findUnique({ where: { id: args.bookingId }, include: { payout: true, customer: true } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  if (booking.channel === "DONATION") throw new AppError("INVALID_STATE", "Donations have no valuation.");
  if (!["COMPLETED", "DISPUTED", "APPROVED"].includes(booking.status)) throw new AppError("INVALID_STATE", "Only collected bookings can be re-valued.");
  if (booking.payout && !["AWAITING_APPROVAL", "UNDER_REVIEW", "APPROVED"].includes(booking.payout.status)) {
    throw new AppError("INVALID_STATE", "The payout has already been sent; raise an adjustment instead.");
  }
  const policy = await getSetting("valuation");
  const net = computeNetGrams(args.grossGrams, args.tareGrams);
  reconcileCategoryWeights(net, args.categoryWeights, args.rejectedGrams, policy.weightToleranceGrams);

  const v = await transaction(async (tx) => {
    const w = await tx.weighingRecord.create({
      data: {
        bookingId: booking.id,
        recordedById: actor.id,
        grossGrams: args.grossGrams,
        tareGrams: args.tareGrams,
        netGrams: net,
        categoryWeights: args.categoryWeights as unknown as Prisma.InputJsonValue,
        rejectedGrams: args.rejectedGrams,
        evidenceKeys: args.evidenceKeys ?? [],
        location: "warehouse",
      },
    });
    const v = await createValuation(tx, actor, {
      booking,
      weighingId: w.id,
      weights: args.categoryWeights,
      grossGrams: args.grossGrams,
      tareGrams: args.tareGrams,
      netGrams: net,
      deductions: args.deductions,
      source: can(actor, "settings:manage") ? "ADMIN_ADJUSTMENT" : "WAREHOUSE_REINSPECTION",
    });
    await tx.booking.update({ where: { id: booking.id }, data: { status: "AWAITING_APPROVAL" } });
    await tx.payout.updateMany({ where: { bookingId: booking.id, status: { in: ["AWAITING_APPROVAL", "APPROVED"] } }, data: { status: "UNDER_REVIEW" } });
    await tx.pickupEvent.create({ data: { bookingId: booking.id, type: "VALUATION_SENT", actorId: actor.id, note: args.reason, meta: { version: v.version, payablePaise: v.payablePaise } } });
    await audit(tx, actor, "valuation.revise", "Valuation", v.id, { after: { version: v.version, payablePaise: v.payablePaise, reason: args.reason } });
    return v;
  });
  await notify(booking.customerId, {
    title: "Revised valuation needs your approval",
    body: `After inspection, booking ${booking.code} was re-valued. Please review and approve or dispute it.`,
    link: `/app/bookings/${booking.id}`,
    channels: ["IN_APP", "SMS", "WHATSAPP"],
  });
  return v;
}

/** Admin dispute resolution. */
export async function resolveDispute(actor: Actor, bookingId: string, outcome: "RETURN" | "REINSTATE_PREVIOUS", note: string) {
  assertPermission(actor, "support:manage");
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "DISPUTED") throw new AppError("INVALID_STATE", "Booking is not under dispute.");
  await transaction(async (tx) => {
    if (outcome === "RETURN") {
      await tx.booking.update({ where: { id: bookingId }, data: { status: "RETURNED" } });
      await tx.payout.updateMany({ where: { bookingId, status: { in: ["AWAITING_APPROVAL", "UNDER_REVIEW", "APPROVED"] } }, data: { status: "UNDER_REVIEW", failureReason: "Clothes returned after dispute" } });
    } else {
      const prev = await tx.valuation.findFirst({ where: { bookingId, status: { in: ["APPROVED", "SUPERSEDED"] }, approvedAt: { not: null } }, orderBy: { version: "desc" } });
      if (!prev) throw new AppError("INVALID_STATE", "No previously approved valuation to reinstate.");
      await tx.valuation.update({ where: { id: prev.id }, data: { status: "APPROVED" } });
      const hasPayout = await tx.payout.findUnique({ where: { bookingId } });
      await tx.booking.update({ where: { id: bookingId }, data: { status: hasPayout ? "COMPLETED" : "APPROVED" } });
      if (hasPayout) await syncPayoutWithValuation(tx, bookingId, prev.id, actor);
    }
    await tx.supportTicket.updateMany({ where: { bookingId, type: "DISPUTE", status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "RESOLVED", resolution: `${outcome}: ${note}` } });
    await tx.pickupEvent.create({ data: { bookingId, type: "NOTE", actorId: actor.id, note: `Dispute resolved — ${outcome}: ${note}` } });
    await audit(tx, actor, "dispute.resolve", "Booking", bookingId, { after: { outcome, note } });
  });
  await notify(booking.customerId, { title: "Dispute resolved", body: `Booking ${booking.code}: ${note}`, link: `/app/bookings/${booking.id}` });
}
