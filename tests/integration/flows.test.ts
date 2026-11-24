import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Capture outbound SMS so tests can read OTP / approval codes.
const sent: { to: string; body: string; otp?: string }[] = [];
vi.mock("@/server/providers/messaging", () => ({
  sendSms: async (to: string, body: string, meta: { otp?: string } = {}) => void sent.push({ to, body, otp: meta.otp }),
  sendWhatsApp: async () => undefined,
  sendEmail: async () => undefined,
}));

import { db } from "@/server/db";
import { buildWorld, type World } from "./fixtures";
import { requestOtp, verifyOtp } from "@/server/auth/otp";
import { createBooking, cancelBooking, pickupCode } from "@/server/services/booking";
import { assignCollector, autoAssign } from "@/server/services/assignment";
import { completePickup, captureDoorstepApproval, recordWeighing, startTrip, verifyArrival } from "@/server/services/collection";
import { respondToValuation, reviseValuation } from "@/server/services/valuation";
import { addUpiAccount, approvePayout, handlePayoutWebhook, initiatePayout, reconcilePayouts } from "@/server/services/payouts";
import { decideRule, proposeRule, quote } from "@/server/services/pricing";
import { decideAdjustment, receiveBatch, requestAdjustment, sortBatch, transferItem } from "@/server/services/warehouse";
import { confirmPurchaseOrder, createListing, dispatchPurchaseOrder, registerBusiness, requestPurchase, verifyBusiness } from "@/server/services/b2b";
import { updateSetting } from "@/server/services/ops";
import { hmacSha256 } from "@/server/domain/codes";
import { SYSTEM_ACTOR } from "@/server/audit";

let w: World;
const book = (over: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(w.as.customer, { channel: "KG_BUYBACK", items: [{ categoryId: w.jeans.id, grams: 5000 }, { categoryId: w.tees.id, grams: 3000 }], bagCount: 2, addressId: w.address.id, pickupDate: w.day, slotId: w.slot.id, ...over });

/** Drive a booking through the doorstep flow up to a pending valuation. */
async function weighed(bookingId: string, code: string, collector = w.as.collector(0)) {
  await startTrip(collector, bookingId);
  await verifyArrival(collector, bookingId, pickupCode(code));
  return recordWeighing(collector, {
    bookingId,
    grossGrams: 9000,
    tareGrams: 500,
    rejectedGrams: 500,
    categoryWeights: [{ categoryId: w.jeans.id, grams: 5000 }, { categoryId: w.tees.id, grams: 3000 }],
    scalePhotoKey: "scale/test.jpg",
  });
}

afterAll(async () => db.$disconnect());

describe("authentication (phone OTP)", () => {
  beforeEach(async () => {
    w = await buildWorld();
    sent.length = 0;
  });
  it("issues a hashed one-time code and consumes it exactly once", async () => {
    await requestOtp("9876543210", "1.1.1.1");
    const code = sent.at(-1)!.otp!;
    const stored = await db.otpChallenge.findFirstOrThrow({ where: { phone: "+919876543210" } });
    expect(stored.codeHash).not.toContain(code);
    await expect(verifyOtp("9876543210", code === "000000" ? "111111" : "000000")).rejects.toThrow(/incorrect/);
    expect(await verifyOtp("98765 43210", code)).toBe("+919876543210");
    await expect(verifyOtp("9876543210", code)).rejects.toThrow();
  });
  it("rate-limits OTP requests per number", async () => {
    for (let i = 0; i < 5; i++) await requestOtp("9876500000", `2.2.2.${i}`);
    await expect(requestOtp("9876500000", "2.2.2.9")).rejects.toThrow(/Too many/);
  });
  it("locks a code after too many wrong attempts", async () => {
    await requestOtp("9876511111", "3.3.3.3");
    const code = sent.at(-1)!.otp!;
    for (let i = 0; i < 5; i++) await expect(verifyOtp("9876511111", "999998")).rejects.toThrow();
    await expect(verifyOtp("9876511111", code)).rejects.toThrow(/Too many/);
  });
});

describe("booking creation & free pickup", () => {
  beforeEach(async () => {
    w = await buildWorld({ slotCapacity: 2, collectors: 2 });
  });
  it("creates a free booking with a server-side pricing snapshot and auto-assigns a collector", async () => {
    const b = await book();
    const full = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { items: true, assignments: true } });
    expect(full.pickupFeePaise).toBe(0);
    expect(full.estimatedPaise).toBe(10000 + 3600);
    expect(full.items.find((i) => i.categoryId === w.jeans.id)?.ratePaisePerKg).toBe(2000);
    expect(full.status).toBe("ASSIGNED");
    expect(full.assignments.filter((a) => a.active)).toHaveLength(1);
    expect((full.pricingSnapshot as { pickupFeePaise: number }).pickupFeePaise).toBe(0);
  });
  it("rejects any attempt to add a pickup fee — in the service and in the database", async () => {
    await expect(book({ pickupFeePaise: 2500 })).rejects.toThrow(/free/i);
    const b = await book();
    await expect(db.booking.update({ where: { id: b.id }, data: { pickupFeePaise: 100 } })).rejects.toThrow(/booking_free_pickup/);
    await expect(updateSetting(w.as.admin, "pickup", { pickupFeePaise: 4900 })).rejects.toThrow(/free/i);
  });
  it("enforces slot capacity and serviceability", async () => {
    await book();
    await book();
    await expect(book()).rejects.toThrow(/filled up/);
    await expect(book({ addressId: w.badAddress.id })).rejects.toThrow(/don't collect/);
  });
  it("never lets later price changes alter an existing booking", async () => {
    const b = await book();
    const rule = await proposeRule(w.as.admin, { categoryId: w.jeans.id, channel: "KG_BUYBACK", condition: "ANY", pricePerKgPaise: 3500, effectiveFrom: new Date(Date.now() - 1000) });
    await decideRule(w.as.admin2, rule.id, "APPROVE");
    const q = await quote({ channel: "KG_BUYBACK", serviceAreaId: w.area.id, city: "Bengaluru", items: [{ categoryId: w.jeans.id, grams: 1000 }] });
    expect(q.totalPaise).toBe(3500);
    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { items: true } });
    expect(after.items.find((i) => i.categoryId === w.jeans.id)?.ratePaisePerKg).toBe(2000);
  });
  it("requires a different administrator to approve a pricing change (maker–checker)", async () => {
    const rule = await proposeRule(w.as.admin, { categoryId: w.tees.id, channel: "KG_BUYBACK", condition: "ANY", pricePerKgPaise: 1300, effectiveFrom: new Date() });
    await expect(decideRule(w.as.admin, rule.id, "APPROVE")).rejects.toThrow(/different administrator/);
    await expect(decideRule(w.as.customer, rule.id, "APPROVE")).rejects.toThrow(/permission/);
    await decideRule(w.as.admin2, rule.id, "APPROVE");
    const live = await db.pricingRule.findMany({ where: { categoryId: w.tees.id, approvalStatus: "APPROVED", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
    expect(live).toHaveLength(1);
  });
  it("lets the customer cancel before the trip starts", async () => {
    const b = await book();
    await cancelBooking(w.as.customer, b.id, "Changed my mind");
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CANCELLED");
    expect(await db.pickupAssignment.count({ where: { bookingId: b.id, active: true } })).toBe(0);
  });
});

describe("collector assignment", () => {
  beforeEach(async () => {
    w = await buildWorld({ slotCapacity: 10, collectors: 2, collectorCapacity: 1 });
  });
  it("balances load and stops at collector capacity", async () => {
    const a = await book();
    const b = await book();
    const c = await book();
    const assigned = await db.pickupAssignment.findMany({ where: { bookingId: { in: [a.id, b.id] }, active: true } });
    expect(new Set(assigned.map((x) => x.collectorId)).size).toBe(2);
    expect((await db.booking.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("SCHEDULED");
    expect(await autoAssign(c.id)).toBeNull();
  });
  it("only admins can assign, and only within the collector's zone", async () => {
    const b = await book();
    await expect(assignCollector(w.as.customer, b.id, w.collectors[1].id)).rejects.toThrow(/permission/);
    const other = await db.serviceArea.create({ data: { name: "Other", city: "Pune", state: "MH", zone: "X", pincodes: ["411001"] } });
    await db.collectorProfile.update({ where: { id: w.collectors[1].id }, data: { serviceAreaId: other.id } });
    await expect(assignCollector(w.as.admin, b.id, w.collectors[1].id)).rejects.toThrow(/service area/);
  });
});

describe("doorstep weighing & customer approval", () => {
  beforeEach(async () => {
    w = await buildWorld();
    sent.length = 0;
  });
  it("verifies the booking code, weighs, and requires customer approval before completion", async () => {
    const b = await book();
    const c = w.as.collector(0);
    await startTrip(c, b.id);
    await expect(verifyArrival(c, b.id, "0000" === pickupCode(b.code) ? "1111" : "0000")).rejects.toThrow(/Incorrect/);
    await verifyArrival(c, b.id, pickupCode(b.code));
    await expect(recordWeighing(c, { bookingId: b.id, grossGrams: 9000, tareGrams: 500, rejectedGrams: 0, categoryWeights: [{ categoryId: w.jeans.id, grams: 1000 }], scalePhotoKey: "x" })).rejects.toThrow(/add up/);
    const { valuation } = await recordWeighing(c, { bookingId: b.id, grossGrams: 9000, tareGrams: 500, rejectedGrams: 500, categoryWeights: [{ categoryId: w.jeans.id, grams: 5000 }, { categoryId: w.tees.id, grams: 3000 }], scalePhotoKey: "scale/x.jpg" });
    expect(valuation!.netGrams).toBe(8500);
    expect(valuation!.payablePaise).toBe(10000 + 3600);
    await expect(completePickup(c, b.id)).rejects.toThrow(/approve/);
    await respondToValuation(w.as.customer, { bookingId: b.id, valuationId: valuation!.id, decision: "APPROVE" });
    const v = await db.valuation.findUniqueOrThrow({ where: { id: valuation!.id } });
    expect(v.status).toBe("APPROVED");
    expect(v.approvedAt).toBeInstanceOf(Date);
    expect(v.version).toBe(1);
    await completePickup(c, b.id);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("COMPLETED");
  });
  it("supports doorstep approval with the code texted to the customer", async () => {
    const b = await book();
    await weighed(b.id, b.code);
    const code = sent.filter((s) => s.body.includes("valuation")).at(-1)!.otp!;
    await expect(captureDoorstepApproval(w.as.collector(0), b.id, "000000" === code ? "111111" : "000000")).rejects.toThrow();
    await captureDoorstepApproval(w.as.collector(0), b.id, code);
    const v = await db.valuation.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(v.approvalMethod).toBe("DOORSTEP_OTP");
  });
  it("routes a rejected valuation into a dispute with a ticket", async () => {
    const b = await book();
    const { valuation } = await weighed(b.id, b.code);
    await respondToValuation(w.as.customer, { bookingId: b.id, valuationId: valuation!.id, decision: "REJECT", reason: "Scale looked off" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("DISPUTED");
    expect(await db.supportTicket.count({ where: { bookingId: b.id, type: "DISPUTE" } })).toBe(1);
  });
  it("prevents collectors from acting on pickups not assigned to them", async () => {
    w = await buildWorld({ collectors: 2, collectorCapacity: 1 });
    const b = await book();
    const owner = (await db.pickupAssignment.findFirstOrThrow({ where: { bookingId: b.id, active: true } })).collectorId;
    const other = w.collectors.findIndex((c) => c.id !== owner);
    await expect(startTrip(w.as.collector(other), b.id)).rejects.toThrow(/not assigned/);
  });
});

describe("direct UPI payouts, idempotency & reconciliation", () => {
  async function completed(vpa: string) {
    await addUpiAccount(w.as.customer, vpa);
    const b = await book();
    const { valuation } = await weighed(b.id, b.code);
    await respondToValuation(w.as.customer, { bookingId: b.id, valuationId: valuation!.id, decision: "APPROVE" });
    await completePickup(w.as.collector(0), b.id);
    return db.payout.findUniqueOrThrow({ where: { bookingId: b.id } });
  }
  beforeEach(async () => {
    w = await buildWorld({ slotCapacity: 10 });
  });
  it("auto-approves small payouts, sends them once, and only marks success after provider confirmation", async () => {
    const p = await completed("ananya@okaxis");
    expect(p.amountPaise).toBe(13600);
    expect(p.status).toBe("PROCESSING");
    expect(await db.payoutAttempt.count({ where: { payoutId: p.id } })).toBe(1);
    // A second initiate while in flight is refused — no duplicate payment.
    await expect(initiatePayout(w.as.admin, p.id)).rejects.toThrow(/already in progress/);
    // Provider settles after a delay; reconciliation picks it up.
    await db.sandboxTransaction.updateMany({ data: { createdAt: new Date(Date.now() - 10_000) } });
    const r = await reconcilePayouts(w.as.admin);
    expect(r.updated).toBe(1);
    const done = await db.payout.findUniqueOrThrow({ where: { id: p.id } });
    expect(done.status).toBe("SUCCESSFUL");
    expect(done.utr).toBeTruthy();
    const ledger = await db.financialLedger.findMany({ where: { referenceId: p.id } });
    const dr = ledger.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + l.amountPaise, 0);
    const cr = ledger.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + l.amountPaise, 0);
    expect(dr).toBe(cr);
    expect(ledger).toHaveLength(4); // accrual + settlement
    // Re-running reconciliation is a no-op.
    await reconcilePayouts(w.as.admin);
    expect(await db.financialLedger.count({ where: { referenceId: p.id } })).toBe(4);
  });
  it("retries failed payouts with a new idempotent attempt and never double-pays", async () => {
    const p = await completed("fail.case@okaxis");
    let cur = await db.payout.findUniqueOrThrow({ where: { id: p.id } });
    expect(cur.status).toBe("FAILED");
    await db.upiAccount.updateMany({ where: { userId: w.customer.id }, data: { isPrimary: false } });
    await db.payout.update({ where: { id: p.id }, data: { upiVpa: "fixed@okaxis" } });
    await Promise.allSettled([initiatePayout(w.as.admin, p.id), initiatePayout(w.as.admin2, p.id)]);
    const attempts = await db.payoutAttempt.findMany({ where: { payoutId: p.id }, orderBy: { attemptNumber: "asc" } });
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts.map((a) => a.idempotencyKey)).size).toBe(2);
    cur = await db.payout.findUniqueOrThrow({ where: { id: p.id } });
    expect(cur.status).toBe("PROCESSING");
  });
  it("verifies webhook signatures and ignores duplicate events", async () => {
    const p = await completed("hook@okaxis");
    const attempt = await db.payoutAttempt.findFirstOrThrow({ where: { payoutId: p.id } });
    const body = JSON.stringify({ id: "evt_1", event: "payout.processed", payload: { payout: { entity: { id: attempt.providerRef, status: "processed", utr: "UTR123" } } } });
    await expect(handlePayoutWebhook(body, "bad-signature")).rejects.toThrow(/signature/);
    const sig = hmacSha256("test-webhook-secret", body);
    expect((await handlePayoutWebhook(body, sig)).status).toBe("SUCCESSFUL");
    expect((await handlePayoutWebhook(body, sig)).duplicate).toBe(true);
    expect((await db.payout.findUniqueOrThrow({ where: { id: p.id } })).utr).toBe("UTR123");
  });
  it("large payouts wait for an admin, and customers cannot approve them", async () => {
    await updateSetting(w.as.admin, "payouts", { autoApproveLimitPaise: 100 });
    const p = await completed("big@okaxis");
    expect(p.status).toBe("AWAITING_APPROVAL");
    await expect(approvePayout(w.as.customer, p.id)).rejects.toThrow(/permission/);
    await approvePayout(w.as.admin, p.id);
    await initiatePayout(w.as.admin, p.id);
    expect((await db.payout.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PROCESSING");
  });
});

describe("warehouse inventory movements", () => {
  beforeEach(async () => {
    w = await buildWorld();
  });
  async function collectedBooking() {
    const b = await book();
    const { valuation } = await weighed(b.id, b.code);
    await respondToValuation(w.as.customer, { bookingId: b.id, valuationId: valuation!.id, decision: "APPROVE" });
    await completePickup(w.as.collector(0), b.id);
    return b;
  }
  it("receives a batch once, sorts it, and tracks weight end to end", async () => {
    const b = await collectedBooking();
    const { batch } = await receiveBatch(w.as.wm, { bookingId: b.id, warehouseId: w.wh.id, receivedGrams: 7980 });
    expect(batch.collectedGrams).toBe(8000);
    await expect(receiveBatch(w.as.wm, { bookingId: b.id, warehouseId: w.wh.id, receivedGrams: 7980 })).rejects.toThrow(/already been received/);
    await expect(sortBatch(w.as.wm, { batchId: batch.id, finalize: false, lines: [{ categoryId: w.jeans.id, grade: "STANDARD_REUSABLE", grams: 9000 }] })).rejects.toThrow(/exceeds/);
    await sortBatch(w.as.wm, { batchId: batch.id, finalize: true, lines: [{ categoryId: w.jeans.id, grade: "PREMIUM_REUSABLE", grams: 1000 }, { categoryId: w.jeans.id, grade: "STANDARD_REUSABLE", grams: 4000 }, { categoryId: w.tees.id, grade: "RECYCLABLE", grams: 2950 }] });
    const sorted = await db.collectionBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(sorted.status).toBe("SORTED");
    expect(sorted.sortedGrams).toBe(7950);
    const items = await db.inventoryItem.findMany({ where: { batchId: batch.id } });
    expect(items.filter((i) => i.grade !== "UNSORTED").reduce((s, i) => s + i.weightGrams, 0)).toBe(7950);
    expect(await db.inventoryMovement.count({ where: { referenceId: batch.id } })).toBeGreaterThanOrEqual(5);
    const std = items.find((i) => i.grade === "STANDARD_REUSABLE")!;
    await transferItem(w.as.wm, { itemId: std.id, toWarehouseId: w.wh2.id });
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { id: std.id } })).warehouseId).toBe(w.wh2.id);
  });
  it("requires a second manager to approve adjustments", async () => {
    const b = await collectedBooking();
    const { batch } = await receiveBatch(w.as.wm, { bookingId: b.id, warehouseId: w.wh.id, receivedGrams: 8000 });
    const lot = await db.inventoryItem.findFirstOrThrow({ where: { batchId: batch.id } });
    const m = await requestAdjustment(w.as.wm, { itemId: lot.id, deltaGrams: -500, reason: "Water damaged bag" });
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { id: lot.id } })).weightGrams).toBe(8000);
    await expect(decideAdjustment(w.as.wm, m.id, true)).rejects.toThrow(/Another manager/);
    await decideAdjustment(w.as.wm2, m.id, true);
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { id: lot.id } })).weightGrams).toBe(7500);
  });
  it("re-inspection issues a new valuation version the customer must approve", async () => {
    await updateSetting(w.as.admin, "payouts", { autoApproveLimitPaise: 100 });
    const b = await collectedBooking();
    const v2 = await reviseValuation(w.as.wm, { bookingId: b.id, grossGrams: 8000, tareGrams: 0, rejectedGrams: 1000, categoryWeights: [{ categoryId: w.jeans.id, grams: 4000 }, { categoryId: w.tees.id, grams: 3000 }], reason: "Damp jeans found" });
    expect(v2.version).toBe(2);
    expect((await db.payout.findUniqueOrThrow({ where: { bookingId: b.id } })).status).toBe("UNDER_REVIEW");
    await respondToValuation(w.as.customer, { bookingId: b.id, valuationId: v2.id, decision: "APPROVE" });
    const p = await db.payout.findUniqueOrThrow({ where: { bookingId: b.id } });
    expect(p.amountPaise).toBe(8000 + 3600);
    expect(p.valuationId).toBe(v2.id);
  });
});

describe("B2B order creation", () => {
  beforeEach(async () => {
    w = await buildWorld();
  });
  it("verifies businesses, enforces MOQ and reserves/deducts stock", async () => {
    const lot = await db.inventoryItem.create({ data: { code: "STD-TEST", kind: "LOT", grade: "STANDARD_REUSABLE", categoryId: w.jeans.id, warehouseId: w.wh.id, weightGrams: 200_000 } });
    const listing = await createListing(w.as.admin, { title: "Bales", categoryId: w.jeans.id, grade: "STANDARD_REUSABLE", inventoryItemId: lot.id, availableGrams: 150_000, pricePerKgPaise: 6000, minOrderGrams: 25_000, allowedTypes: ["THRIFT_STORE"] });
    const buyer = await db.user.create({ data: { phone: "+919811111111", name: "Buyer", roleId: w.roles.CUSTOMER } });
    const actor = { id: buyer.id, role: "B2B_BUYER" };
    const biz = await registerBusiness({ id: buyer.id, role: "CUSTOMER" }, { legalName: "Thrift Co", businessType: "THRIFT_STORE", gstin: "29AAICS1234F1Z5", addressLine: "x", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await expect(requestPurchase(actor, { listingId: listing.id, grams: 50_000, deliveryAddress: "x" })).rejects.toThrow(/verification/);
    await verifyBusiness(w.as.admin, biz.id, "VERIFIED");
    await expect(requestPurchase(actor, { listingId: listing.id, grams: 10_000, deliveryAddress: "x" })).rejects.toThrow(/Minimum/);
    const po = await requestPurchase(actor, { listingId: listing.id, grams: 50_000, deliveryAddress: "x" });
    expect(po.status).toBe("REQUESTED");
    const confirmed = await confirmPurchaseOrder(w.as.admin, po.id);
    expect(confirmed.totalPaise).toBe(300_000);
    expect(confirmed.invoiceNumber).toMatch(/^RW\/B2B\//);
    expect((await db.businessListing.findUniqueOrThrow({ where: { id: listing.id } })).reservedGrams).toBe(50_000);
    await dispatchPurchaseOrder(w.as.admin, po.id, "Fleet", "LR-1");
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { id: lot.id } })).weightGrams).toBe(150_000);
    const l = await db.businessListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect([l.availableGrams, l.reservedGrams]).toEqual([100_000, 0]);
  });
  it("blocks other roles from B2B management", async () => {
    await expect(createListing(w.as.collector(0), { title: "x", categoryId: w.jeans.id, grade: "RECYCLABLE", availableGrams: 1000, pricePerKgPaise: 1, minOrderGrams: 1000, allowedTypes: [] })).rejects.toThrow(/permission/);
    await expect(reconcilePayouts(w.as.customer)).rejects.toThrow(/permission/);
    await expect(proposeRule(w.as.collector(0), { categoryId: w.jeans.id, channel: "KG_BUYBACK", condition: "ANY", pricePerKgPaise: 1, effectiveFrom: new Date() })).rejects.toThrow(/permission/);
    expect(SYSTEM_ACTOR.role).toBe("SYSTEM");
  });
});
