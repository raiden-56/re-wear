"use server";

import { z } from "zod";
import { authedAction, zs } from "@/server/action";
import { assignCollector, autoAssign } from "@/server/services/assignment";
import { cancelBooking, markBookingFailed, reopenFailedBooking } from "@/server/services/booking";
import { resolveDispute } from "@/server/services/valuation";
import { decideRule, deactivateRule, proposeRule } from "@/server/services/pricing";
import { approvePayout, holdPayout, initiatePayout, reconcilePayouts } from "@/server/services/payouts";
import { addBlackout, changeRole, createStaffUser, recordOperatingCost, removeBlackout, saveCategory, saveServiceArea, saveSlot, saveTemplate, saveWarehouse, setTicketStatus, setUserStatus, updateCollector, updateSetting, replyTicket } from "@/server/services/ops";
import { confirmPurchaseOrder, counterOffer, createListing, dispatchPurchaseOrder, markPurchaseOrderPaid, setBusinessPricing, verifyBusiness, cancelPurchaseOrder } from "@/server/services/b2b";
import { upsertDonationPartner, verifyRecycler } from "@/server/services/partners";
import { refundOrder } from "@/server/services/marketplace";

const rev = { revalidate: ["/admin"] };
const kgToG = z.coerce.number().min(0).transform((v) => Math.round(v * 1000));
const inrToP = z.coerce.number().min(0).transform((v) => Math.round(v * 100));

// ── Bookings ──
export const assignAction = authedAction(z.object({ bookingId: zs.id, collectorId: zs.id }), async (u, i) => {
  await assignCollector(u, i.bookingId, i.collectorId);
  return "Collector assigned.";
}, rev);

export const autoAssignAction = authedAction(z.object({ bookingId: zs.id }), async (_u, i) => {
  const c = await autoAssign(i.bookingId);
  return c ? `Auto-assigned to ${c.user.name}.` : "No collector with spare capacity — assign manually.";
}, rev);

export const adminCancelAction = authedAction(z.object({ bookingId: zs.id, reason: zs.req(300) }), async (u, i) => {
  await cancelBooking(u, i.bookingId, i.reason);
  return "Booking cancelled; customer notified.";
}, rev);

export const adminFailAction = authedAction(z.object({ bookingId: zs.id, reason: zs.req(300) }), async (u, i) => {
  await markBookingFailed(u, i.bookingId, i.reason);
  return "Marked as failed.";
}, rev);

export const reopenAction = authedAction(z.object({ bookingId: zs.id, pickupDate: z.string(), slotId: zs.id }), async (u, i) => {
  await reopenFailedBooking(u, i.bookingId, i.pickupDate, i.slotId);
  return "Pickup rescheduled.";
}, rev);

export const resolveDisputeAction = authedAction(z.object({ bookingId: zs.id, outcome: z.enum(["RETURN", "REINSTATE_PREVIOUS"]), note: zs.req(300) }), async (u, i) => {
  await resolveDispute(u, i.bookingId, i.outcome, i.note);
  return "Dispute resolved.";
}, rev);

// ── Pricing ──
export const proposeRuleAction = authedAction(
  z.object({
    categoryId: zs.id,
    channel: z.enum(["KG_BUYBACK", "PREMIUM_RESALE", "RECYCLING"]),
    condition: z.enum(["ANY", "EXCELLENT", "GOOD", "FAIR", "WORN"]),
    serviceAreaId: zs.optional(64),
    city: zs.optional(60),
    price: z.coerce.number().min(0).max(1000),
    effectiveFrom: z.string().min(10, "Choose an effective date"),
    effectiveTo: zs.optional(30),
    notes: zs.optional(300),
  }),
  async (u, i) => {
    await proposeRule(u, {
      categoryId: i.categoryId,
      channel: i.channel,
      condition: i.condition,
      serviceAreaId: i.serviceAreaId,
      city: i.city,
      pricePerKgPaise: Math.round(i.price * 100),
      effectiveFrom: new Date(i.effectiveFrom),
      effectiveTo: i.effectiveTo ? new Date(i.effectiveTo) : null,
      notes: i.notes,
    });
    return "Rate proposed — awaiting approval by another administrator.";
  },
  rev,
);

export const decideRuleAction = authedAction(z.object({ ruleId: zs.id, decision: z.enum(["APPROVE", "REJECT"]), note: zs.optional(300) }), async (u, i) => {
  await decideRule(u, i.ruleId, i.decision, i.note ?? undefined);
  return i.decision === "APPROVE" ? "Rate approved and live from its effective date." : "Rate rejected.";
}, rev);

export const deactivateRuleAction = authedAction(z.object({ ruleId: zs.id }), async (u, i) => {
  await deactivateRule(u, i.ruleId);
  return "Rule deactivated.";
}, rev);

// ── Payouts ──
export const approvePayoutAction = authedAction(z.object({ payoutId: zs.id, andSend: zs.bool }), async (u, i) => {
  await approvePayout(u, i.payoutId);
  if (i.andSend) await initiatePayout(u, i.payoutId);
  return i.andSend ? "Approved and sent to the payout provider." : "Payout approved.";
}, rev);

export const holdPayoutAction = authedAction(z.object({ payoutId: zs.id, reason: zs.req(300) }), async (u, i) => {
  await holdPayout(u, i.payoutId, i.reason);
  return "Payout moved to review.";
}, rev);

export const initiatePayoutAction = authedAction(z.object({ payoutId: zs.id }), async (u, i) => {
  const r = await initiatePayout(u, i.payoutId);
  return `Payout attempt sent — status: ${r.status.toLowerCase()}.`;
}, rev);

export const reconcileAction = authedAction(z.object({}), async (u) => {
  const s = await reconcilePayouts(u);
  return `Reconciled ${s.checked} in-flight payouts · ${s.updated} updated · ${s.errors} errors.`;
}, rev);

// ── Operations ──
export const saveAreaAction = authedAction(
  z.object({
    id: zs.optional(64),
    name: zs.req(80),
    city: zs.req(60),
    state: zs.req(60),
    zone: zs.req(60),
    pincodes: z.string().transform((s) => s.split(/[\s,]+/).filter(Boolean)),
    active: zs.bool,
    operatingStart: z.string().regex(/^\d{2}:\d{2}$/),
    operatingEnd: z.string().regex(/^\d{2}:\d{2}$/),
    operatingDays: zs.list.transform((l) => l.map(Number)),
    minimumKg: z.coerce.number().min(0).max(100),
    policyNote: zs.optional(300),
    logisticsCost: inrToP,
  }),
  async (u, i) => {
    await saveServiceArea(u, { id: i.id ?? undefined, name: i.name, city: i.city, state: i.state, zone: i.zone, pincodes: i.pincodes, active: i.active, operatingStart: i.operatingStart, operatingEnd: i.operatingEnd, operatingDays: i.operatingDays, minimumKgPolicy: Math.round(i.minimumKg * 1000), policyNote: i.policyNote, logisticsCostPerPickupPaise: i.logisticsCost });
    return "Service area saved.";
  },
  rev,
);

export const saveSlotAction = authedAction(
  z.object({ id: zs.optional(64), serviceAreaId: zs.id, label: zs.req(40), startTime: z.string(), endTime: z.string(), capacity: z.coerce.number().int().min(0), active: zs.bool }),
  async (u, i) => {
    await saveSlot(u, { ...i, id: i.id ?? undefined });
    return "Slot saved.";
  },
  rev,
);

export const blackoutAction = authedAction(z.object({ serviceAreaId: zs.optional(64), date: z.string(), reason: zs.req(120) }), async (u, i) => {
  await addBlackout(u, { serviceAreaId: i.serviceAreaId, date: i.date, reason: i.reason });
  return "Blackout date added.";
}, rev);

export const removeBlackoutAction = authedAction(z.object({ id: zs.id }), async (u, i) => {
  await removeBlackout(u, i.id);
  return "Removed.";
}, rev);

export const createStaffAction = authedAction(
  z.object({ name: zs.req(80), phone: zs.req(15), email: zs.optional(120), role: z.enum(["COLLECTOR", "WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN", "DONATION_PARTNER"]), serviceAreaId: zs.optional(64), vehicleNumber: zs.optional(20), dailyCapacity: z.coerce.number().int().min(1).max(40).optional() }),
  async (u, i) => {
    await createStaffUser(u, i);
    return "Account created. They can sign in with OTP on their phone.";
  },
  rev,
);

export const updateCollectorAction = authedAction(z.object({ id: zs.id, serviceAreaId: zs.optional(64), dailyCapacity: z.coerce.number().int().min(1).max(40), active: zs.bool, vehicleNumber: zs.optional(20) }), async (u, i) => {
  await updateCollector(u, i.id, { serviceAreaId: i.serviceAreaId, dailyCapacity: i.dailyCapacity, active: i.active, vehicleNumber: i.vehicleNumber });
  return "Collector updated.";
}, rev);

export const saveWarehouseAction = authedAction(z.object({ id: zs.optional(64), code: zs.req(20), name: zs.req(80), city: zs.req(60), address: zs.optional(200), serviceAreaId: zs.optional(64), active: zs.bool }), async (u, i) => {
  await saveWarehouse(u, { ...i, id: i.id ?? undefined });
  return "Warehouse saved.";
}, rev);

// ── Customers & users ──
export const userStatusAction = authedAction(z.object({ userId: zs.id, status: z.enum(["ACTIVE", "SUSPENDED"]), reason: zs.req(200) }), async (u, i) => {
  await setUserStatus(u, i.userId, i.status, i.reason);
  return i.status === "SUSPENDED" ? "Account suspended and signed out." : "Account reactivated.";
}, rev);

export const changeRoleAction = authedAction(z.object({ userId: zs.id, role: z.enum(["CUSTOMER", "COLLECTOR", "WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN", "B2B_BUYER", "RECYCLER_PARTNER", "DONATION_PARTNER"]) }), async (u, i) => {
  await changeRole(u, i.userId, i.role);
  return "Role changed; the user's sessions were revoked.";
}, rev);

// ── Settings ──
export const settingAction = authedAction(z.object({ key: z.enum(["branding", "pickup", "valuation", "payouts", "rewards", "marketplace", "integrations", "testimonials"]), json: z.string() }), async (u, i) => {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(i.json);
  } catch {
    throw new z.ZodError([{ code: "custom", path: ["json"], message: "Invalid JSON", input: i.json }]);
  }
  await updateSetting(u, i.key, value);
  return "Settings saved.";
}, rev);

export const categoryAction = authedAction(
  z.object({ id: zs.optional(64), slug: z.string().regex(/^[a-z0-9-]+$/, "Lowercase slug"), name: zs.req(60), description: zs.optional(200), group: zs.req(20), accepted: zs.bool, active: zs.bool, sortOrder: z.coerce.number().int(), imageUrl: zs.optional(400) }),
  async (u, i) => {
    await saveCategory(u, { ...i, id: i.id ?? undefined });
    return "Category saved.";
  },
  rev,
);

export const templateAction = authedAction(z.object({ id: zs.id, subject: zs.optional(200), body: zs.req(1000), active: zs.bool }), async (u, i) => {
  await saveTemplate(u, i);
  return "Template saved.";
}, rev);

// ── Finance ──
export const costAction = authedAction(z.object({ account: z.enum(["LOGISTICS_COST", "SORTING_COST", "PROCESSING_COST"]), amount: inrToP, costDate: z.string(), city: zs.optional(60), description: zs.req(200) }), async (u, i) => {
  await recordOperatingCost(u, { account: i.account, amountPaise: i.amount, costDate: i.costDate, city: i.city, description: i.description });
  return "Cost recorded in the ledger.";
}, rev);

export const refundAction = authedAction(z.object({ orderId: zs.id, amount: inrToP, reason: zs.req(200) }), async (u, i) => {
  await refundOrder(u, i.orderId, i.amount, i.reason);
  return "Refund processed.";
}, rev);

// ── B2B ──
export const verifyBusinessAction = authedAction(z.object({ profileId: zs.id, decision: z.enum(["VERIFIED", "REJECTED", "SUSPENDED"]), reason: zs.optional(300) }), async (u, i) => {
  await verifyBusiness(u, i.profileId, i.decision, i.reason ?? undefined);
  return `Business ${i.decision.toLowerCase()}.`;
}, rev);

export const businessPricingAction = authedAction(z.object({ profileId: zs.id, priceTier: zs.req(30), discountPct: z.coerce.number().min(0).max(30) }), async (u, i) => {
  await setBusinessPricing(u, i.profileId, i.priceTier, Math.round(i.discountPct * 100));
  return "Pricing updated.";
}, rev);

export const createListingAction = authedAction(
  z.object({ title: zs.req(120), description: zs.optional(500), categoryId: zs.id, grade: z.enum(["PREMIUM_REUSABLE", "STANDARD_REUSABLE", "REPAIRABLE", "RECYCLABLE", "UPCYCLING"]), inventoryItemId: zs.optional(64), availableKg: kgToG, price: inrToP, moqKg: kgToG, allowedTypes: zs.list }),
  async (u, i) => {
    await createListing(u, { title: i.title, description: i.description ?? undefined, categoryId: i.categoryId, grade: i.grade, inventoryItemId: i.inventoryItemId, availableGrams: i.availableKg, pricePerKgPaise: i.price, minOrderGrams: i.moqKg, allowedTypes: i.allowedTypes as never });
    return "Bulk listing published to verified partners.";
  },
  rev,
);

export const adminCounterAction = authedAction(z.object({ poId: zs.id, price: z.coerce.number().positive(), kg: z.coerce.number().positive(), message: zs.optional(500) }), async (u, i) => {
  await counterOffer(u, i.poId, Math.round(i.price * 100), Math.round(i.kg * 1000), i.message ?? undefined);
  return "Counter-offer sent.";
}, rev);

export const confirmPoAction = authedAction(z.object({ poId: zs.id }), async (u, i) => {
  await confirmPurchaseOrder(u, i.poId);
  return "Order confirmed and stock reserved.";
}, rev);

export const dispatchPoAction = authedAction(z.object({ poId: zs.id, courier: zs.req(60), trackingNumber: zs.req(60) }), async (u, i) => {
  await dispatchPurchaseOrder(u, i.poId, i.courier, i.trackingNumber);
  return "Dispatched; stock deducted.";
}, rev);

export const poPaidAction = authedAction(z.object({ poId: zs.id }), async (u, i) => {
  await markPurchaseOrderPaid(u, i.poId);
  return "Payment recorded in the ledger.";
}, rev);

export const cancelPoAction = authedAction(z.object({ poId: zs.id, reason: zs.req(200) }), async (u, i) => {
  await cancelPurchaseOrder(u, i.poId, i.reason);
  return "Purchase order cancelled.";
}, rev);

// ── Partners ──
export const verifyRecyclerAction = authedAction(z.object({ partnerId: zs.id, decision: z.enum(["VERIFIED", "REJECTED", "SUSPENDED"]), rate: z.coerce.number().min(0).optional() }), async (u, i) => {
  await verifyRecycler(u, i.partnerId, i.decision, i.rate !== undefined ? Math.round(i.rate * 100) : undefined);
  return "Recycler updated.";
}, rev);

export const donationPartnerAction = authedAction(
  z.object({ id: zs.optional(64), name: zs.req(120), registrationNo: zs.optional(60), has80G: zs.bool, city: zs.req(60), focusAreas: z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)), description: zs.optional(300), verificationStatus: z.enum(["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"]), active: zs.bool }),
  async (u, i) => {
    await upsertDonationPartner(u, { ...i, id: i.id ?? undefined, registrationNo: i.registrationNo ?? undefined, description: i.description ?? undefined });
    return "NGO partner saved.";
  },
  rev,
);

// ── Support ──
export const ticketStatusAction = authedAction(z.object({ ticketId: zs.id, status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]), resolution: zs.optional(300) }), async (u, i) => {
  await setTicketStatus(u, i.ticketId, i.status, i.resolution ?? undefined);
  return "Ticket updated.";
}, rev);

export const staffReplyAction = authedAction(z.object({ ticketId: zs.id, body: zs.req(2000), internal: zs.bool }), async (u, i) => {
  await replyTicket(u, i.ticketId, i.body, i.internal);
  return "Reply sent.";
}, rev);

