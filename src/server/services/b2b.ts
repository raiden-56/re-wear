import type { BusinessType, SortGrade } from "@prisma/client";
import { db, transaction } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission, can } from "../auth/guard";
import { humanCode } from "../domain/codes";
import { AppError } from "../domain/errors";
import { cr, dr, postJournal } from "./ledger";
import { notify } from "./notifications";
import { dispatchFromLot } from "./warehouse";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Convert a fresh account into a business buyer pending verification. */
export async function registerBusiness(
  actor: Actor,
  input: { legalName: string; tradeName?: string; businessType: BusinessType; gstin?: string; pan?: string; contactEmail?: string; contactPhone?: string; addressLine: string; city: string; state: string; pincode: string },
) {
  if (input.gstin && !GSTIN.test(input.gstin.toUpperCase())) throw new AppError("VALIDATION", "Enter a valid 15-character GSTIN.");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, include: { role: true, businessProfile: true, _count: { select: { bookings: true } } } });
  if (user.businessProfile) throw new AppError("CONFLICT", "A business profile already exists for this account.");
  if (!["CUSTOMER"].includes(user.role.key) || user._count.bookings > 0) {
    throw new AppError("INVALID_STATE", "Use a separate phone number for your business account, or contact support.");
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: input.businessType === "NGO" ? "B2B_BUYER" : "B2B_BUYER" } });
  return transaction(async (tx) => {
    const p = await tx.businessProfile.create({ data: { ...input, gstin: input.gstin?.toUpperCase(), userId: actor.id } });
    await tx.user.update({ where: { id: actor.id }, data: { roleId: role.id } });
    await audit(tx, actor, "b2b.register", "BusinessProfile", p.id, { after: input });
    return p;
  });
}

export async function verifyBusiness(actor: Actor, profileId: string, decision: "VERIFIED" | "REJECTED" | "SUSPENDED", reason?: string) {
  assertPermission(actor, "business:verify");
  const p = await db.businessProfile.update({
    where: { id: profileId },
    data: { verificationStatus: decision, verifiedAt: decision === "VERIFIED" ? new Date() : null, verifiedById: actor.id, rejectionReason: decision === "VERIFIED" ? null : reason },
  });
  await audit(db, actor, `b2b.${decision.toLowerCase()}`, "BusinessProfile", profileId, { after: { decision, reason } });
  await notify(p.userId, {
    title: decision === "VERIFIED" ? "Business account verified" : "Business verification update",
    body: decision === "VERIFIED" ? "You can now place bulk purchase requests on ReWear." : `Status: ${decision.toLowerCase()}. ${reason ?? ""}`,
    link: "/business",
    channels: ["IN_APP", "EMAIL"],
  });
  return p;
}

export async function setBusinessPricing(actor: Actor, profileId: string, priceTier: string, discountBps: number) {
  assertPermission(actor, "b2b:manage");
  if (discountBps < 0 || discountBps > 3000) throw new AppError("VALIDATION", "Discount must be between 0% and 30%.");
  await db.businessProfile.update({ where: { id: profileId }, data: { priceTier, discountBps } });
  await audit(db, actor, "b2b.pricing", "BusinessProfile", profileId, { after: { priceTier, discountBps } });
}

/** Business-specific price: list price less the account's negotiated discount. */
export const businessPrice = (listPaise: number, discountBps: number) => Math.round((listPaise * (10_000 - discountBps)) / 10_000);

export async function createListing(
  actor: Actor,
  input: { title: string; description?: string; categoryId: string; grade: SortGrade; inventoryItemId?: string | null; availableGrams: number; pricePerKgPaise: number; minOrderGrams: number; allowedTypes: BusinessType[]; photoUrls?: string[] },
) {
  assertPermission(actor, "b2b:manage");
  if (input.minOrderGrams <= 0 || input.availableGrams < input.minOrderGrams) throw new AppError("VALIDATION", "Available stock must be at least the minimum order quantity.");
  if (input.inventoryItemId) {
    const lot = await db.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
    if (!lot || lot.kind !== "LOT" || lot.grade !== input.grade) throw new AppError("VALIDATION", "Linked lot must match the listing grade.");
    if (lot.weightGrams < input.availableGrams) throw new AppError("VALIDATION", "Listing weight exceeds the lot's stock.");
  }
  const l = await db.businessListing.create({ data: { ...input, photoUrls: input.photoUrls ?? [], code: humanCode("BL"), createdById: actor.id } });
  await audit(db, actor, "b2b.listing_create", "BusinessListing", l.id, { after: input });
  return l;
}

async function verifiedBusiness(actor: Actor) {
  assertPermission(actor, "b2b:buy");
  const b = await db.businessProfile.findUnique({ where: { userId: actor.id } });
  if (!b) throw new AppError("FORBIDDEN", "Complete your business profile first.");
  if (b.verificationStatus !== "VERIFIED") throw new AppError("FORBIDDEN", "Your business account is awaiting verification.");
  return b;
}

export async function visibleListings(businessType: BusinessType | null) {
  const all = await db.businessListing.findMany({ where: { active: true }, include: { category: true }, orderBy: { createdAt: "desc" } });
  return all.filter((l) => (l.allowedTypes.length === 0 || (businessType && l.allowedTypes.includes(businessType))) && l.availableGrams - l.reservedGrams >= l.minOrderGrams);
}

export async function requestPurchase(actor: Actor, input: { listingId: string; grams: number; offeredPricePerKgPaise?: number | null; message?: string; deliveryAddress: string }) {
  const biz = await verifiedBusiness(actor);
  const listing = await db.businessListing.findUnique({ where: { id: input.listingId } });
  if (!listing || !listing.active) throw new AppError("NOT_FOUND", "Listing not available.");
  if (listing.allowedTypes.length && !listing.allowedTypes.includes(biz.businessType)) throw new AppError("FORBIDDEN", "This lot is restricted to other partner types.");
  if (input.grams < listing.minOrderGrams) throw new AppError("VALIDATION", `Minimum order is ${listing.minOrderGrams / 1000} kg.`);
  if (input.grams > listing.availableGrams - listing.reservedGrams) throw new AppError("VALIDATION", "Requested quantity exceeds available stock.");
  const list = businessPrice(listing.pricePerKgPaise, biz.discountBps);
  const negotiating = !!input.offeredPricePerKgPaise && input.offeredPricePerKgPaise !== list;
  const po = await db.purchaseOrder.create({
    data: {
      code: humanCode("PR"),
      businessId: biz.id,
      listingId: listing.id,
      requestedGrams: input.grams,
      listPricePerKgPaise: list,
      deliveryAddress: input.deliveryAddress,
      status: negotiating ? "NEGOTIATING" : "REQUESTED",
      offers: { create: { byRole: "BUYER", actorId: actor.id, pricePerKgPaise: input.offeredPricePerKgPaise ?? list, grams: input.grams, message: input.message } },
    },
  });
  await audit(db, actor, "b2b.request", "PurchaseOrder", po.id, { after: input });
  return po;
}

export async function counterOffer(actor: Actor, poId: string, pricePerKgPaise: number, grams: number, message?: string) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { business: true, listing: true } });
  if (!po) throw new AppError("NOT_FOUND", "Purchase request not found.");
  const isBuyer = po.business.userId === actor.id;
  if (!isBuyer) assertPermission(actor, "b2b:manage");
  if (!["REQUESTED", "NEGOTIATING"].includes(po.status)) throw new AppError("INVALID_STATE", "Negotiation is closed for this order.");
  if (pricePerKgPaise <= 0 || grams < po.listing.minOrderGrams) throw new AppError("VALIDATION", "Offer must meet the minimum order quantity.");
  await db.purchaseOrder.update({
    where: { id: poId },
    data: { status: "NEGOTIATING", requestedGrams: grams, offers: { create: { byRole: isBuyer ? "BUYER" : "REWEAR", actorId: actor.id, pricePerKgPaise, grams, message } } },
  });
  await audit(db, actor, "b2b.offer", "PurchaseOrder", poId, { after: { pricePerKgPaise, grams } });
  if (!isBuyer) await notify(po.business.userId, { title: "New counter-offer", body: `${po.code}: ₹${(pricePerKgPaise / 100).toFixed(2)}/kg`, link: `/business/orders/${po.id}` });
}

/** Confirm at the latest offer price (either party accepts the other's offer; ReWear confirms stock). */
export async function confirmPurchaseOrder(actor: Actor, poId: string) {
  const po0 = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { business: true, offers: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!po0) throw new AppError("NOT_FOUND", "Purchase request not found.");
  const isBuyer = po0.business.userId === actor.id;
  const last = po0.offers[0];
  if (isBuyer) {
    if (!last || last.byRole !== "REWEAR") throw new AppError("INVALID_STATE", "There is no ReWear offer to accept yet.");
  } else assertPermission(actor, "b2b:manage");
  return transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    if (!["REQUESTED", "NEGOTIATING"].includes(po.status)) throw new AppError("INVALID_STATE", "Order already confirmed or closed.");
    const price = last?.pricePerKgPaise ?? po.listPricePerKgPaise;
    const n = await tx.$executeRaw`UPDATE "BusinessListing" SET "reservedGrams" = "reservedGrams" + ${po.requestedGrams}, "updatedAt" = now()
      WHERE id = ${po.listingId} AND active = true AND "availableGrams" - "reservedGrams" >= ${po.requestedGrams}`;
    if (n !== 1) throw new AppError("CONFLICT", "Not enough stock left on this listing.");
    const total = Math.round((po.requestedGrams * price) / 1000);
    const seq = (await tx.purchaseOrder.count({ where: { invoiceNumber: { not: null } } })) + 1;
    const fy = (() => {
      const d = new Date();
      const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
      return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    })();
    const updated = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "CONFIRMED", agreedPricePerKgPaise: price, totalPaise: total, confirmedAt: new Date(), invoiceNumber: `RW/B2B/${fy}/${String(seq).padStart(5, "0")}` },
    });
    await audit(tx, actor, "b2b.confirm", "PurchaseOrder", po.id, { after: { price, total } });
    return updated;
  });
}

export async function dispatchPurchaseOrder(actor: Actor, poId: string, courier: string, trackingNumber: string) {
  assertPermission(actor, "b2b:manage");
  const po = await transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { listing: true } });
    if (!po || po.status !== "CONFIRMED") throw new AppError("INVALID_STATE", "Only confirmed orders can be dispatched.");
    const n = await tx.$executeRaw`UPDATE "BusinessListing" SET "availableGrams" = "availableGrams" - ${po.requestedGrams}, "reservedGrams" = "reservedGrams" - ${po.requestedGrams}, "updatedAt" = now()
      WHERE id = ${po.listingId} AND "reservedGrams" >= ${po.requestedGrams}`;
    if (n !== 1) throw new AppError("CONFLICT", "Reservation mismatch on listing.");
    if (po.listing.inventoryItemId) await dispatchFromLot(tx, { itemId: po.listing.inventoryItemId, grams: po.requestedGrams, actorId: actor.id, referenceType: "PURCHASE_ORDER", referenceId: po.id });
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "DISPATCHED", dispatchedAt: new Date(), courier, trackingNumber } });
    await audit(tx, actor, "b2b.dispatch", "PurchaseOrder", po.id, { after: { courier, trackingNumber } });
    return po;
  });
  const biz = await db.businessProfile.findUniqueOrThrow({ where: { id: po.businessId } });
  await notify(biz.userId, { title: "Order dispatched", body: `${po.code} via ${courier} (${trackingNumber}).`, link: `/business/orders/${po.id}` });
}

export async function markDelivered(actor: Actor, poId: string) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { business: true } });
  if (!po) throw new AppError("NOT_FOUND", "Order not found.");
  if (po.business.userId !== actor.id) assertPermission(actor, "b2b:manage");
  if (po.status !== "DISPATCHED") throw new AppError("INVALID_STATE", "Order has not been dispatched.");
  await db.purchaseOrder.update({ where: { id: poId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  await audit(db, actor, "b2b.delivered", "PurchaseOrder", poId);
}

/** Record the buyer's payment against the invoice (bank transfer / NEFT). */
export async function markPurchaseOrderPaid(actor: Actor, poId: string) {
  assertPermission(actor, "b2b:manage");
  await transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || !po.totalPaise || !["CONFIRMED", "DISPATCHED", "DELIVERED"].includes(po.status)) throw new AppError("INVALID_STATE", "Order is not invoiced.");
    if (po.paymentStatus === "CAPTURED") return;
    await tx.purchaseOrder.update({ where: { id: poId }, data: { paymentStatus: "CAPTURED" } });
    await postJournal(tx, {
      key: `po:${po.id}:payment`,
      referenceType: "PURCHASE_ORDER",
      referenceId: po.id,
      description: `B2B invoice ${po.invoiceNumber} paid`,
      legs: [dr("BANK", po.totalPaise), cr("B2B_REVENUE", po.totalPaise)],
      actorId: actor.id,
    });
    await audit(tx, actor, "b2b.paid", "PurchaseOrder", poId);
  });
}

export async function cancelPurchaseOrder(actor: Actor, poId: string, reason: string) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { business: true } });
  if (!po) throw new AppError("NOT_FOUND", "Order not found.");
  if (po.business.userId !== actor.id && !can(actor, "b2b:manage")) throw new AppError("FORBIDDEN", "Not your order.");
  if (!["REQUESTED", "NEGOTIATING", "CONFIRMED"].includes(po.status)) throw new AppError("INVALID_STATE", "Dispatched orders cannot be cancelled.");
  await transaction(async (tx) => {
    if (po.status === "CONFIRMED") await tx.$executeRaw`UPDATE "BusinessListing" SET "reservedGrams" = GREATEST(0, "reservedGrams" - ${po.requestedGrams}) WHERE id = ${po.listingId}`;
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await audit(tx, actor, "b2b.cancel", "PurchaseOrder", poId, { after: { reason } });
  });
}
