import type { ClothingCondition, OrderStatus, Prisma } from "@prisma/client";
import { db, isUniqueViolation, transaction } from "../db";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { assertPermission, can } from "../auth/guard";
import { hmacSha256, humanCode, randomCode, slugify } from "../domain/codes";
import { AppError } from "../domain/errors";
import { env } from "../env";
import { paymentProvider } from "../providers/payment";
import { getSetting } from "../settings";
import { cr, dr, postJournal } from "./ledger";
import { notify } from "./notifications";

// ───────────── Listings (admin / warehouse) ─────────────

export async function createProduct(
  actor: Actor,
  input: { inventoryItemId: string; name: string; brand?: string; categoryId: string; gender?: string; size: string; condition: ClothingCondition; description: string; pricePaise: number; mrpPaise?: number | null; photoUrls: string[] },
) {
  assertPermission(actor, "marketplace:manage");
  if (input.pricePaise <= 0) throw new AppError("VALIDATION", "Selling price must be greater than zero.");
  if (input.photoUrls.length === 0) throw new AppError("VALIDATION", "Add at least one photograph.");
  const item = await db.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, include: { product: true } });
  if (!item || item.kind !== "UNIT") throw new AppError("VALIDATION", "Link the listing to an individual inventory garment.");
  if (item.product) throw new AppError("CONFLICT", "This garment already has a listing.");
  // Uploaded listing photos become public (they are shown on the storefront).
  const keys = input.photoUrls.filter((u) => u.startsWith("/api/files/")).map((u) => u.slice("/api/files/".length));
  if (keys.length) await db.storedFile.updateMany({ where: { key: { in: keys }, purpose: "INVENTORY_PHOTO" }, data: { isPublic: true } });
  for (let i = 0; i < 3; i++) {
    try {
      const p = await db.marketplaceProduct.create({
        data: { ...input, mrpPaise: input.mrpPaise ?? null, slug: `${slugify(`${input.brand ?? ""} ${input.name}`)}-${randomCode(4).toLowerCase()}`, quantity: 1, status: "DRAFT", createdById: actor.id },
      });
      await audit(db, actor, "marketplace.product_create", "MarketplaceProduct", p.id, { after: { name: p.name, pricePaise: p.pricePaise } });
      return p;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new AppError("CONFLICT", "Could not create listing.");
}

export async function updateProduct(actor: Actor, id: string, input: Partial<{ name: string; brand: string; description: string; pricePaise: number; mrpPaise: number | null; size: string; photoUrls: string[] }>) {
  assertPermission(actor, "marketplace:manage");
  if (input.pricePaise !== undefined && input.pricePaise <= 0) throw new AppError("VALIDATION", "Selling price must be greater than zero.");
  const before = await db.marketplaceProduct.findUniqueOrThrow({ where: { id } });
  const p = await db.marketplaceProduct.update({ where: { id }, data: input });
  await audit(db, actor, "marketplace.product_update", "MarketplaceProduct", id, { before, after: p });
  return p;
}

/** Only garments that passed quality inspection can be published. */
export async function setPublished(actor: Actor, id: string, publish: boolean) {
  assertPermission(actor, "marketplace:manage");
  return transaction(async (tx) => {
    const p = await tx.marketplaceProduct.findUnique({ where: { id }, include: { inventoryItem: true } });
    if (!p || p.deletedAt) throw new AppError("NOT_FOUND", "Listing not found.");
    if (publish) {
      if (!p.inventoryItem || !p.inventoryItem.inspectionPassed || p.inventoryItem.grade !== "PREMIUM_REUSABLE") {
        throw new AppError("VALIDATION", "This garment has not passed premium quality inspection.");
      }
      if (p.quantity - p.reserved <= 0) throw new AppError("VALIDATION", "Nothing in stock to publish.");
      await tx.inventoryItem.update({ where: { id: p.inventoryItem.id }, data: { status: "LISTED" } });
    } else if (p.inventoryItem && p.inventoryItem.status === "LISTED") {
      await tx.inventoryItem.update({ where: { id: p.inventoryItem.id }, data: { status: "IN_STOCK" } });
    }
    const updated = await tx.marketplaceProduct.update({ where: { id }, data: { status: publish ? "PUBLISHED" : "UNPUBLISHED", publishedAt: publish ? new Date() : p.publishedAt } });
    await audit(tx, actor, publish ? "marketplace.publish" : "marketplace.unpublish", "MarketplaceProduct", id);
    return updated;
  });
}

// ───────────── Cart & wishlist ─────────────

export async function addToCart(actor: Actor, productId: string, quantity = 1) {
  assertPermission(actor, "marketplace:buy");
  const p = await db.marketplaceProduct.findFirst({ where: { id: productId, status: "PUBLISHED", deletedAt: null } });
  if (!p) throw new AppError("NOT_FOUND", "This item is no longer available.");
  if (p.quantity - p.reserved < quantity) throw new AppError("CONFLICT", "Sorry, this item was just reserved by someone else.");
  await db.cartItem.upsert({ where: { userId_productId: { userId: actor.id, productId } }, create: { userId: actor.id, productId, quantity }, update: { quantity } });
}

export async function removeFromCart(actor: Actor, productId: string) {
  await db.cartItem.deleteMany({ where: { userId: actor.id, productId } });
}

export async function toggleWishlist(actor: Actor, productId: string) {
  const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId: actor.id, productId } } });
  if (existing) await db.wishlistItem.delete({ where: { id: existing.id } });
  else await db.wishlistItem.create({ data: { userId: actor.id, productId } });
  return !existing;
}

// ───────────── Checkout with inventory reservation ─────────────

export async function checkout(actor: Actor, addressId: string) {
  assertPermission(actor, "marketplace:buy");
  await expireReservations();
  const cfg = await getSetting("marketplace");
  const order = await transaction(async (tx) => {
    const address = await tx.address.findFirst({ where: { id: addressId, userId: actor.id, deletedAt: null } });
    if (!address) throw new AppError("VALIDATION", "Choose a delivery address.");
    const cart = await tx.cartItem.findMany({ where: { userId: actor.id }, include: { product: true } });
    if (cart.length === 0) throw new AppError("VALIDATION", "Your cart is empty.");
    for (const c of cart) {
      // Atomic reservation: succeeds only if enough unreserved stock remains.
      const n = await tx.$executeRaw`UPDATE "MarketplaceProduct" SET "reserved" = "reserved" + ${c.quantity}, "updatedAt" = now()
        WHERE id = ${c.productId} AND status = 'PUBLISHED' AND "deletedAt" IS NULL AND "quantity" - "reserved" >= ${c.quantity}`;
      if (n !== 1) throw new AppError("CONFLICT", `“${c.product.name}” is no longer available.`);
    }
    const subtotal = cart.reduce((s, c) => s + c.product.pricePaise * c.quantity, 0); // server-side prices only
    const shipping = subtotal >= cfg.freeShippingAbovePaise ? 0 : cfg.shippingFlatPaise;
    const o = await tx.marketplaceOrder.create({
      data: {
        code: humanCode("OD"),
        buyerId: actor.id,
        subtotalPaise: subtotal,
        shippingPaise: shipping,
        totalPaise: subtotal + shipping,
        shippingAddress: { name: address.contactName, phone: address.contactPhone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, pincode: address.pincode },
        reservedUntil: new Date(Date.now() + cfg.reservationMinutes * 60_000),
        paymentProvider: paymentProvider().name,
        items: { create: cart.map((c) => ({ productId: c.productId, name: c.product.name, pricePaise: c.product.pricePaise, quantity: c.quantity })) },
      },
    });
    await tx.cartItem.deleteMany({ where: { userId: actor.id } });
    await audit(tx, actor, "marketplace.checkout", "MarketplaceOrder", o.id, { after: { totalPaise: o.totalPaise } });
    return o;
  });
  const pay = await paymentProvider().createOrder({ amountPaise: order.totalPaise, receipt: order.code });
  await db.marketplaceOrder.update({ where: { id: order.id }, data: { paymentRef: pay.orderRef } });
  return { orderId: order.id, code: order.code, paymentRef: pay.orderRef, amountPaise: order.totalPaise, keyId: pay.keyId };
}

/** Sandbox gateway: produce the signature a real gateway would return (server-side only). */
export function sandboxSignature(orderRef: string, paymentId: string) {
  return hmacSha256(env().PAYMENT_WEBHOOK_SECRET, `${orderRef}|${paymentId}`);
}

export async function confirmPayment(actor: Actor, args: { orderId: string; paymentId: string; signature: string }) {
  const order = await db.marketplaceOrder.findUnique({ where: { id: args.orderId }, include: { items: { include: { product: true } } } });
  if (!order) throw new AppError("NOT_FOUND", "Order not found.");
  if (actor.id !== order.buyerId && actor.role !== "SYSTEM") throw new AppError("FORBIDDEN", "Not your order.");
  if (order.status === "PAID") return order;
  if (!order.paymentRef || !paymentProvider().verifyPayment({ orderRef: order.paymentRef, paymentId: args.paymentId, signature: args.signature })) {
    throw new AppError("VALIDATION", "Payment could not be verified.");
  }
  await transaction(async (tx) => {
    const r = await tx.marketplaceOrder.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "PAID", paymentStatus: "CAPTURED", paidAt: new Date(), reservedUntil: null } });
    if (r.count !== 1) throw new AppError("INVALID_STATE", "This order is no longer awaiting payment (reservation may have expired).");
    for (const it of order.items) {
      const n = await tx.$executeRaw`UPDATE "MarketplaceProduct" SET "quantity" = "quantity" - ${it.quantity}, "reserved" = "reserved" - ${it.quantity},
          "status" = CASE WHEN "quantity" - ${it.quantity} <= 0 THEN 'SOLD_OUT'::"ProductStatus" ELSE "status" END, "updatedAt" = now()
        WHERE id = ${it.productId} AND "reserved" >= ${it.quantity}`;
      if (n !== 1) throw new AppError("CONFLICT", "Reservation mismatch.");
      if (it.product.inventoryItemId) {
        await tx.inventoryItem.update({ where: { id: it.product.inventoryItemId }, data: { status: "SOLD", quantity: 0 } });
        await tx.inventoryMovement.create({
          data: { itemId: it.product.inventoryItemId, type: "SALE", deltaGrams: -(await tx.inventoryItem.findUniqueOrThrow({ where: { id: it.product.inventoryItemId } })).weightGrams, deltaQuantity: -it.quantity, actorId: order.buyerId, referenceType: "MARKETPLACE_ORDER", referenceId: order.id },
        });
      }
    }
    await postJournal(tx, {
      key: `order:${order.id}:capture`,
      referenceType: "MARKETPLACE_ORDER",
      referenceId: order.id,
      description: `Marketplace order ${order.code}`,
      legs: [dr("BANK", order.totalPaise), cr("MARKETPLACE_REVENUE", order.totalPaise)],
    });
    await audit(tx, actor, "marketplace.payment_captured", "MarketplaceOrder", order.id, { after: { paymentId: args.paymentId } });
  });
  await notify(order.buyerId, { title: "Order confirmed", body: `Order ${order.code} is paid. We'll pack it within 24 hours.`, link: `/app/orders/${order.id}`, channels: ["IN_APP", "EMAIL"] });
  return order;
}

/** Release stock held by unpaid orders whose reservation window passed. */
export async function expireReservations() {
  const stale = await db.marketplaceOrder.findMany({ where: { status: "PENDING_PAYMENT", reservedUntil: { lt: new Date() } }, include: { items: true } });
  for (const o of stale) {
    await transaction(async (tx) => {
      const r = await tx.marketplaceOrder.updateMany({ where: { id: o.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", cancelledAt: new Date(), paymentStatus: "FAILED" } });
      if (r.count !== 1) return;
      for (const it of o.items) {
        await tx.$executeRaw`UPDATE "MarketplaceProduct" SET "reserved" = GREATEST(0, "reserved" - ${it.quantity}) WHERE id = ${it.productId}`;
      }
      await audit(tx, SYSTEM_ACTOR, "marketplace.reservation_expired", "MarketplaceOrder", o.id);
    });
  }
  return stale.length;
}

const FULFILMENT: Record<string, OrderStatus[]> = { PAID: ["PACKED", "CANCELLED"], PACKED: ["SHIPPED", "CANCELLED"], SHIPPED: ["DELIVERED"] };

export async function updateFulfilment(actor: Actor, orderId: string, to: OrderStatus, tracking?: { courier?: string; trackingNumber?: string }) {
  assertPermission(actor, "marketplace:manage");
  const o = await db.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!o) throw new AppError("NOT_FOUND", "Order not found.");
  if (!FULFILMENT[o.status]?.includes(to)) throw new AppError("INVALID_STATE", `Cannot move order from ${o.status} to ${to}.`);
  if (to === "CANCELLED") return cancelOrder(actor, orderId, "Cancelled by ReWear");
  const data: Prisma.MarketplaceOrderUpdateInput = { status: to, ...tracking };
  if (to === "SHIPPED") data.shippedAt = new Date();
  if (to === "DELIVERED") data.deliveredAt = new Date();
  await db.marketplaceOrder.update({ where: { id: orderId }, data });
  await audit(db, actor, "marketplace.fulfilment", "MarketplaceOrder", orderId, { before: { status: o.status }, after: { status: to, ...tracking } });
  await notify(o.buyerId, { title: `Order ${to.toLowerCase()}`, body: `Order ${o.code} is now ${to.toLowerCase()}${tracking?.trackingNumber ? ` (${tracking.courier} ${tracking.trackingNumber})` : ""}.`, link: `/app/orders/${o.id}` });
}

export async function cancelOrder(actor: Actor, orderId: string, reason: string) {
  const o = await db.marketplaceOrder.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } });
  if (!o) throw new AppError("NOT_FOUND", "Order not found.");
  const isBuyer = o.buyerId === actor.id;
  if (!isBuyer && !can(actor, "marketplace:manage")) throw new AppError("FORBIDDEN", "Not your order.");
  if (!["PENDING_PAYMENT", "PAID", "PACKED"].includes(o.status)) throw new AppError("INVALID_STATE", "Shipped orders can't be cancelled — request a return instead.");
  await transaction(async (tx) => {
    await tx.marketplaceOrder.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    for (const it of o.items) {
      if (o.status === "PENDING_PAYMENT") {
        await tx.$executeRaw`UPDATE "MarketplaceProduct" SET "reserved" = GREATEST(0, "reserved" - ${it.quantity}) WHERE id = ${it.productId}`;
      } else {
        // Restock the garment.
        await tx.$executeRaw`UPDATE "MarketplaceProduct" SET "quantity" = "quantity" + ${it.quantity}, "status" = 'PUBLISHED' WHERE id = ${it.productId}`;
        if (it.product.inventoryItemId) {
          await tx.inventoryItem.update({ where: { id: it.product.inventoryItemId }, data: { status: "LISTED", quantity: 1 } });
          await tx.inventoryMovement.create({ data: { itemId: it.product.inventoryItemId, type: "RETURN", deltaGrams: 0, deltaQuantity: it.quantity, actorId: actor.id, referenceType: "MARKETPLACE_ORDER", referenceId: o.id, reason } });
        }
      }
    }
    await audit(tx, actor, "marketplace.cancel", "MarketplaceOrder", o.id, { after: { reason } });
  });
  if (o.status !== "PENDING_PAYMENT") await refundOrder({ ...SYSTEM_ACTOR }, o.id, o.totalPaise, `Cancellation: ${reason}`);
}

export async function refundOrder(actor: Actor, orderId: string, amountPaise: number, reason: string) {
  if (actor.role !== "SYSTEM") assertPermission(actor, "marketplace:manage");
  const o = await db.marketplaceOrder.findUnique({ where: { id: orderId }, include: { refunds: true } });
  if (!o || !o.paymentRef) throw new AppError("NOT_FOUND", "Order not found.");
  if (!["CAPTURED", "PARTIALLY_REFUNDED"].includes(o.paymentStatus)) throw new AppError("INVALID_STATE", "Order has no captured payment.");
  const refunded = o.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amountPaise, 0);
  if (amountPaise <= 0 || refunded + amountPaise > o.totalPaise) throw new AppError("VALIDATION", "Refund exceeds the amount paid.");
  const refund = await db.refund.create({ data: { orderId, amountPaise, reason, requestedById: actor.id === "system" ? o.buyerId : actor.id } });
  const res = await paymentProvider().refund({ paymentRef: o.paymentRef, amountPaise, idempotencyKey: `refund:${refund.id}` });
  await transaction(async (tx) => {
    await tx.refund.update({ where: { id: refund.id }, data: { status: "PROCESSED", providerRef: res.refundRef, processedAt: new Date(), processedById: actor.id === "system" ? null : actor.id } });
    const full = refunded + amountPaise === o.totalPaise;
    await tx.marketplaceOrder.update({ where: { id: orderId }, data: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED", status: full ? (o.status === "CANCELLED" ? "CANCELLED" : "REFUNDED") : o.status } });
    await postJournal(tx, {
      key: `refund:${refund.id}`,
      referenceType: "REFUND",
      referenceId: refund.id,
      description: `Refund for ${o.code}: ${reason}`,
      legs: [dr("REFUNDS", amountPaise), cr("BANK", amountPaise)],
    });
    await audit(tx, actor, "marketplace.refund", "Refund", refund.id, { after: { amountPaise, reason } });
  });
  await notify(o.buyerId, { title: "Refund processed", body: `₹${(amountPaise / 100).toFixed(2)} refunded for order ${o.code}.`, link: `/app/orders/${o.id}` });
}

export async function addReview(actor: Actor, args: { productId: string; orderId: string; rating: number; title?: string; body?: string }) {
  if (args.rating < 1 || args.rating > 5) throw new AppError("VALIDATION", "Rating must be 1–5.");
  const order = await db.marketplaceOrder.findFirst({ where: { id: args.orderId, buyerId: actor.id, status: "DELIVERED", items: { some: { productId: args.productId } } } });
  if (!order) throw new AppError("FORBIDDEN", "You can review items from delivered orders only.");
  try {
    return await db.review.create({ data: { productId: args.productId, orderId: args.orderId, userId: actor.id, rating: args.rating, title: args.title, body: args.body } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "You've already reviewed this item.");
    throw e;
  }
}
