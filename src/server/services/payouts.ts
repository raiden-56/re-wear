import type { Payout, PayoutStatus, Prisma } from "@prisma/client";
import { db, isUniqueViolation, transaction, type Tx } from "../db";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { humanCode } from "../domain/codes";
import { AppError } from "../domain/errors";
import { canTransition, PAYOUT_INITIABLE, PAYOUT_TRANSITIONS, type PayoutState } from "../domain/state";
import { payoutProvider, VPA_PATTERN, type ProviderPayout } from "../providers/payout";
import { getSetting } from "../settings";
import { formatINR } from "@/lib/utils";
import { cr, dr, postJournal } from "./ledger";
import { notify } from "./notifications";

/*
 * Direct UPI payout lifecycle — no wallet, no stored balance.
 *
 *   AWAITING_APPROVAL ─approve→ APPROVED ─initiate→ INITIATED ─provider→ PROCESSING → SUCCESSFUL
 *                                                         └──────────────→ FAILED ─retry→ INITIATED …
 *
 * Duplicate-payment safety:
 *   1. One payout row per booking (unique bookingId).
 *   2. A new provider attempt can only start from APPROVED/FAILED/REVERSED, claimed with a
 *      conditional UPDATE — concurrent clicks cannot both win.
 *   3. Every attempt has a unique idempotency key sent to the provider; reconciliation
 *      re-sends the SAME key when an outcome is unknown, so the provider returns the original.
 *   4. SUCCESSFUL is set only from a provider confirmation (webhook or status fetch).
 */

async function primaryVpa(client: Tx | typeof db, userId: string) {
  const acc = await client.upiAccount.findFirst({ where: { userId, deletedAt: null, verified: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] });
  return acc?.vpa ?? null;
}

export async function createPayoutForBooking(tx: Tx, bookingId: string, actor: Actor) {
  const existing = await tx.payout.findUnique({ where: { bookingId } });
  if (existing) return existing;
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const valuation = await tx.valuation.findFirst({ where: { bookingId, status: "APPROVED" }, orderBy: { version: "desc" } });
  if (!valuation) throw new AppError("INVALID_STATE", "No approved valuation for this booking.");
  if (valuation.payablePaise <= 0) return null;
  const vpa = await primaryVpa(tx, booking.customerId);
  const payout = await tx.payout.create({
    data: {
      code: humanCode("PO"),
      bookingId,
      customerId: booking.customerId,
      valuationId: valuation.id,
      amountPaise: valuation.payablePaise,
      upiVpa: vpa,
      provider: payoutProvider().name,
      status: "AWAITING_APPROVAL",
    },
  });
  await audit(tx, actor, "payout.create", "Payout", payout.id, { after: { amountPaise: payout.amountPaise, bookingId } });
  return payout;
}

/** After a re-inspection valuation is approved, the pending payout follows the new amount. */
export async function syncPayoutWithValuation(tx: Tx, bookingId: string, valuationId: string, actor: Actor) {
  const payout = await tx.payout.findUnique({ where: { bookingId } });
  const v = await tx.valuation.findUniqueOrThrow({ where: { id: valuationId } });
  if (!payout) {
    await createPayoutForBooking(tx, bookingId, actor);
    return;
  }
  if (!["AWAITING_APPROVAL", "UNDER_REVIEW", "APPROVED"].includes(payout.status)) throw new AppError("INVALID_STATE", "Payout already sent.");
  await tx.payout.update({ where: { id: payout.id }, data: { amountPaise: v.payablePaise, valuationId: v.id, status: "AWAITING_APPROVAL", approvedAt: null, approvedById: null, version: { increment: 1 } } });
  await audit(tx, actor, "payout.revalue", "Payout", payout.id, { before: { amountPaise: payout.amountPaise }, after: { amountPaise: v.payablePaise } });
}

async function transition(tx: Tx, payout: Payout, to: PayoutStatus, data: Prisma.PayoutUpdateManyMutationInput = {}) {
  if (!canTransition(PAYOUT_TRANSITIONS, payout.status as PayoutState, to)) return false;
  const r = await tx.payout.updateMany({ where: { id: payout.id, version: payout.version, status: payout.status }, data: { ...data, status: to, version: { increment: 1 } } });
  return r.count === 1;
}

async function accrue(tx: Tx, payout: Payout, actorId: string) {
  await postJournal(tx, {
    key: `payout:${payout.id}:accrual:${payout.valuationId}`,
    referenceType: "PAYOUT",
    referenceId: payout.id,
    bookingId: payout.bookingId,
    customerId: payout.customerId,
    actorId,
    description: `Customer payout approved ${payout.code}`,
    legs: [dr("CUSTOMER_PAYOUTS", payout.amountPaise), cr("PAYOUT_CLEARING", payout.amountPaise)],
  });
}

export async function approvePayout(actor: Actor, payoutId: string) {
  assertPermission(actor, "payout:approve");
  await transaction(async (tx) => {
    const p = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!p) throw new AppError("NOT_FOUND", "Payout not found.");
    if (!p.upiVpa) throw new AppError("VALIDATION", "Customer has not added a verified UPI ID yet.");
    const disputed = await tx.booking.findFirst({ where: { id: p.bookingId, status: { in: ["DISPUTED", "AWAITING_APPROVAL", "RETURNED"] } } });
    if (disputed) throw new AppError("INVALID_STATE", "The valuation is not settled — resolve the booking first.");
    if (!(await transition(tx, p, "APPROVED", { approvedById: actor.id === "system" ? null : actor.id, approvedAt: new Date(), failureReason: null }))) {
      throw new AppError("INVALID_STATE", `Payout cannot be approved from ${p.status.toLowerCase().replace(/_/g, " ")}.`);
    }
    await accrue(tx, p, actor.id);
    await audit(tx, actor, "payout.approve", "Payout", p.id, { before: { status: p.status }, after: { status: "APPROVED" } });
  });
}

export async function holdPayout(actor: Actor, payoutId: string, reason: string) {
  assertPermission(actor, "payout:approve");
  await transaction(async (tx) => {
    const p = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    if (!(await transition(tx, p, "UNDER_REVIEW", { failureReason: reason }))) throw new AppError("INVALID_STATE", "Payout cannot be put under review now.");
    await audit(tx, actor, "payout.hold", "Payout", p.id, { after: { reason } });
  });
}

/** Auto-approve and send small payouts when policy allows and a verified UPI ID exists. */
export async function autoApproveIfEligible(bookingId: string) {
  const p = await db.payout.findUnique({ where: { bookingId } });
  if (!p || p.status !== "AWAITING_APPROVAL" || !p.upiVpa) return;
  const { autoApproveLimitPaise } = await getSetting("payouts");
  if (p.amountPaise > autoApproveLimitPaise) return;
  try {
    await approvePayout(SYSTEM_ACTOR, p.id);
    await initiatePayout(SYSTEM_ACTOR, p.id);
  } catch (e) {
    console.error("auto payout failed", e);
  }
}

/** Claim + send one provider attempt. Safe to call concurrently. */
export async function initiatePayout(actor: Actor, payoutId: string) {
  assertPermission(actor, "payout:initiate");
  const { maxAttempts } = await getSetting("payouts");
  const claimed = await transaction(async (tx) => {
    const p = await tx.payout.findUnique({ where: { id: payoutId }, include: { customer: true } });
    if (!p) throw new AppError("NOT_FOUND", "Payout not found.");
    if (!PAYOUT_INITIABLE.includes(p.status as PayoutState)) {
      throw new AppError("INVALID_STATE", p.status === "INITIATED" || p.status === "PROCESSING" ? "A payout attempt is already in progress — reconcile instead of retrying." : `Payout is ${p.status.toLowerCase()}.`);
    }
    if (!p.upiVpa || !VPA_PATTERN.test(p.upiVpa)) throw new AppError("VALIDATION", "No valid UPI ID on this payout.");
    if (p.attemptCount >= maxAttempts) throw new AppError("INVALID_STATE", "Maximum payout attempts reached — move to review.");
    const attemptNumber = p.attemptCount + 1;
    const ok = await tx.payout.updateMany({
      where: { id: p.id, version: p.version, status: p.status },
      data: { status: "INITIATED", attemptCount: attemptNumber, failureReason: null, version: { increment: 1 } },
    });
    if (ok.count !== 1) throw new AppError("CONFLICT", "Payout is already being processed.");
    const attempt = await tx.payoutAttempt.create({
      data: {
        payoutId: p.id,
        attemptNumber,
        idempotencyKey: `${p.code}-A${attemptNumber}`,
        initiatedById: actor.id === "system" ? null : actor.id,
        request: { amountPaise: p.amountPaise, vpa: p.upiVpa },
      },
    });
    await audit(tx, actor, attemptNumber > 1 ? "payout.retry" : "payout.initiate", "Payout", p.id, { after: { attemptNumber, idempotencyKey: attempt.idempotencyKey } });
    return { payout: p, attempt };
  });

  const { payout, attempt } = claimed;
  let result: ProviderPayout;
  try {
    result = await payoutProvider().createPayout({
      idempotencyKey: attempt.idempotencyKey,
      amountPaise: payout.amountPaise,
      vpa: payout.upiVpa!,
      name: payout.customer.name ?? "ReWear customer",
      narration: `ReWear ${payout.code}`,
      referenceId: payout.code,
    });
  } catch (e) {
    // Outcome unknown (timeout / 5xx). Leave INITIATED: reconciliation will re-query with the same key.
    await db.payoutAttempt.update({ where: { id: attempt.id }, data: { status: "SENT", failureReason: e instanceof Error ? e.message : "Unknown provider error" } });
    return { status: "INITIATED" as const };
  }
  await db.payoutAttempt.update({ where: { id: attempt.id }, data: { status: "SENT", providerRef: result.reference, response: (result.raw ?? result) as Prisma.InputJsonValue } });
  await db.payout.update({ where: { id: payout.id }, data: { providerRef: result.reference } });
  return applyProviderUpdate(attempt.id, result);
}

export const retryPayout = initiatePayout;

/** Apply a provider status to an attempt + payout. Idempotent and order-tolerant. */
export async function applyProviderUpdate(attemptId: string, update: ProviderPayout) {
  const outcome = await transaction(async (tx) => {
    const attempt = await tx.payoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const p = await tx.payout.findUniqueOrThrow({ where: { id: attempt.payoutId } });
    const latest = await tx.payoutAttempt.findFirst({ where: { payoutId: p.id }, orderBy: { attemptNumber: "desc" } });
    const isLatest = latest?.id === attempt.id;

    const attemptStatus = update.status === "processed" ? "SUCCESSFUL" : update.status === "failed" ? "FAILED" : update.status === "reversed" ? "REVERSED" : "PROCESSING";
    await tx.payoutAttempt.update({
      where: { id: attempt.id },
      data: { status: attemptStatus, utr: update.utr ?? attempt.utr, failureReason: update.failureReason ?? null, providerRef: attempt.providerRef ?? update.reference },
    });
    if (!isLatest && attemptStatus !== "SUCCESSFUL") return { status: p.status, changed: false };

    const target: PayoutStatus = attemptStatus === "SUCCESSFUL" ? "SUCCESSFUL" : attemptStatus === "FAILED" ? "FAILED" : attemptStatus === "REVERSED" ? "REVERSED" : "PROCESSING";
    if (p.status === target) return { status: p.status, changed: false };
    const ok = await transition(tx, p, target, {
      utr: update.utr ?? undefined,
      providerRef: update.reference || undefined,
      failureReason: target === "FAILED" || target === "REVERSED" ? update.failureReason ?? "Provider reported a failure" : null,
      completedAt: target === "SUCCESSFUL" ? new Date() : undefined,
    });
    if (!ok) return { status: p.status, changed: false };

    if (target === "SUCCESSFUL") {
      await postJournal(tx, {
        key: `payout:${p.id}:settle`,
        referenceType: "PAYOUT",
        referenceId: p.id,
        bookingId: p.bookingId,
        customerId: p.customerId,
        description: `UPI payout settled ${p.code} (UTR ${update.utr ?? "n/a"})`,
        legs: [dr("PAYOUT_CLEARING", p.amountPaise), cr("BANK", p.amountPaise)],
      });
    }
    if (target === "REVERSED" && p.status === "SUCCESSFUL") {
      await postJournal(tx, {
        key: `payout:${p.id}:reverse:${attempt.attemptNumber}`,
        referenceType: "PAYOUT",
        referenceId: p.id,
        bookingId: p.bookingId,
        customerId: p.customerId,
        description: `UPI payout reversed ${p.code}`,
        legs: [dr("BANK", p.amountPaise), cr("PAYOUT_CLEARING", p.amountPaise)],
      });
    }
    await audit(tx, SYSTEM_ACTOR, "payout.provider_update", "Payout", p.id, { before: { status: p.status }, after: { status: target, utr: update.utr } });
    return { status: target, changed: true, payout: p };
  });

  if (outcome.changed && outcome.payout) {
    const p = outcome.payout;
    if (outcome.status === "SUCCESSFUL") {
      await notify(p.customerId, { title: "Payment received", body: `${formatINR(p.amountPaise)} sent to your UPI ID for ${p.code}.`, link: `/app/payments`, channels: ["IN_APP", "SMS", "WHATSAPP"] });
    } else if (outcome.status === "FAILED" || outcome.status === "REVERSED") {
      await notify(p.customerId, { title: "Payment unsuccessful", body: `Your payout ${p.code} did not go through. Our team will retry — you may want to check your UPI ID.`, link: `/app/payments` });
    }
  }
  return { status: outcome.status };
}

/** Verified webhook entry point. Deduplicates on (provider, eventId). */
export async function handlePayoutWebhook(rawBody: string, signature: string | null) {
  const provider = payoutProvider();
  if (!provider.verifyWebhook(rawBody, signature)) throw new AppError("FORBIDDEN", "Invalid webhook signature.");
  const evt = provider.parseWebhook(rawBody);
  try {
    await db.webhookEvent.create({ data: { provider: provider.name, eventId: evt.eventId, type: evt.type, payload: JSON.parse(rawBody) } });
  } catch (e) {
    if (isUniqueViolation(e)) return { duplicate: true };
    throw e;
  }
  const attempt = await db.payoutAttempt.findUnique({ where: { providerRef: evt.payout.reference } });
  if (!attempt) {
    await db.webhookEvent.update({ where: { provider_eventId: { provider: provider.name, eventId: evt.eventId } }, data: { error: "Unknown payout reference" } });
    return { duplicate: false, matched: false };
  }
  const r = await applyProviderUpdate(attempt.id, evt.payout);
  await db.webhookEvent.update({ where: { provider_eventId: { provider: provider.name, eventId: evt.eventId } }, data: { processedAt: new Date() } });
  return { duplicate: false, matched: true, status: r.status };
}

/**
 * Reconciliation: ask the provider for the truth on every in-flight payout.
 * Attempts without a provider reference (unknown outcome) are re-sent with the
 * SAME idempotency key — the provider returns the original payout, never a second one.
 */
export async function reconcilePayouts(actor: Actor = SYSTEM_ACTOR) {
  assertPermission(actor, "payout:reconcile");
  const inflight = await db.payout.findMany({ where: { status: { in: ["INITIATED", "PROCESSING"] } }, include: { customer: true } });
  const summary = { checked: 0, updated: 0, errors: 0 };
  for (const p of inflight) {
    summary.checked++;
    const attempt = await db.payoutAttempt.findFirst({ where: { payoutId: p.id }, orderBy: { attemptNumber: "desc" } });
    if (!attempt) continue;
    try {
      const res = attempt.providerRef
        ? await payoutProvider().fetchPayout(attempt.providerRef)
        : await payoutProvider().createPayout({
            idempotencyKey: attempt.idempotencyKey,
            amountPaise: p.amountPaise,
            vpa: p.upiVpa!,
            name: p.customer.name ?? "ReWear customer",
            narration: `ReWear ${p.code}`,
            referenceId: p.code,
          });
      if (!attempt.providerRef) {
        await db.payoutAttempt.update({ where: { id: attempt.id }, data: { providerRef: res.reference } });
        await db.payout.update({ where: { id: p.id }, data: { providerRef: res.reference } });
      }
      const r = await applyProviderUpdate(attempt.id, res);
      if (r.status !== p.status) summary.updated++;
    } catch (e) {
      summary.errors++;
      console.error("reconcile failed", p.code, e);
    }
  }
  await audit(db, actor, "payout.reconcile", "Payout", null, { after: summary });
  return summary;
}

// ───────────── Customer UPI IDs (no PINs or credentials ever stored) ─────────────

export async function addUpiAccount(actor: Actor, rawVpa: string) {
  const vpa = rawVpa.trim().toLowerCase();
  if (!VPA_PATTERN.test(vpa)) throw new AppError("VALIDATION", "Enter a valid UPI ID, e.g. name@okaxis.");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const check = await payoutProvider().validateVpa(vpa, user.name);
  if (!check.valid) throw new AppError("VALIDATION", "We couldn't verify this UPI ID. Please check it and try again.");
  const count = await db.upiAccount.count({ where: { userId: actor.id, deletedAt: null } });
  const acc = await transaction(async (tx) => {
    const existing = await tx.upiAccount.findUnique({ where: { userId_vpa: { userId: actor.id, vpa } } });
    const acc = existing
      ? await tx.upiAccount.update({ where: { id: existing.id }, data: { deletedAt: null, verified: true, verifiedAt: new Date(), nameAtBank: check.nameAtBank } })
      : await tx.upiAccount.create({ data: { userId: actor.id, vpa, verified: true, verifiedAt: new Date(), nameAtBank: check.nameAtBank, isPrimary: count === 0 } });
    if (count === 0 && !acc.isPrimary) await tx.upiAccount.update({ where: { id: acc.id }, data: { isPrimary: true } });
    // Attach to payouts that were waiting for a UPI ID.
    await tx.payout.updateMany({ where: { customerId: actor.id, upiVpa: null, status: { in: ["AWAITING_APPROVAL", "UNDER_REVIEW"] } }, data: { upiVpa: vpa } });
    await audit(tx, actor, "upi.add", "UpiAccount", acc.id, { after: { vpa } });
    return acc;
  });
  const waiting = await db.payout.findMany({ where: { customerId: actor.id, status: "AWAITING_APPROVAL" } });
  for (const p of waiting) await autoApproveIfEligible(p.bookingId);
  return acc;
}

export async function setPrimaryUpi(actor: Actor, accountId: string) {
  await transaction(async (tx) => {
    const acc = await tx.upiAccount.findFirst({ where: { id: accountId, userId: actor.id, deletedAt: null } });
    if (!acc) throw new AppError("NOT_FOUND", "UPI ID not found.");
    await tx.upiAccount.updateMany({ where: { userId: actor.id, isPrimary: true }, data: { isPrimary: false } });
    await tx.upiAccount.update({ where: { id: accountId }, data: { isPrimary: true } });
    // Future and not-yet-sent payouts go to the new primary ID.
    await tx.payout.updateMany({ where: { customerId: actor.id, status: { in: ["AWAITING_APPROVAL", "UNDER_REVIEW", "APPROVED", "FAILED"] } }, data: { upiVpa: acc.vpa } });
    await audit(tx, actor, "upi.primary", "UpiAccount", accountId);
  });
}

export async function removeUpi(actor: Actor, accountId: string) {
  await transaction(async (tx) => {
    const acc = await tx.upiAccount.findFirst({ where: { id: accountId, userId: actor.id, deletedAt: null } });
    if (!acc) throw new AppError("NOT_FOUND", "UPI ID not found.");
    await tx.upiAccount.update({ where: { id: accountId }, data: { deletedAt: new Date(), isPrimary: false } });
    await audit(tx, actor, "upi.remove", "UpiAccount", accountId);
  });
}
