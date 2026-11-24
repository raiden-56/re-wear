"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authedAction, zs } from "@/server/action";
import { addReview, addToCart, cancelOrder, checkout, confirmPayment, removeFromCart, sandboxSignature, toggleWishlist } from "@/server/services/marketplace";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/domain/errors";
import { randomCode } from "@/server/domain/codes";

export const addToCartAction = authedAction(z.object({ productId: zs.id }), async (user, i) => {
  await addToCart(user, i.productId);
  return "Added to your bag.";
}, { revalidate: ["/shop"] });

export const removeFromCartAction = authedAction(z.object({ productId: zs.id }), async (user, i) => {
  await removeFromCart(user, i.productId);
  return "Removed.";
}, { revalidate: ["/shop"] });

export const toggleWishlistAction = authedAction(z.object({ productId: zs.id }), async (user, i) => {
  const added = await toggleWishlist(user, i.productId);
  return added ? "Saved to wishlist." : "Removed from wishlist.";
}, { revalidate: ["/shop"] });

export const checkoutAction = authedAction(z.object({ addressId: zs.id }), async (user, i) => {
  const r = await checkout(user, i.addressId);
  redirect(`/shop/pay/${r.orderId}`);
});

/** Sandbox gateway only: simulates the signed callback a real gateway would send. */
export const sandboxPayAction = authedAction(z.object({ orderId: zs.id, outcome: z.enum(["success", "failure"]) }), async (user, i) => {
  if (env().PAYMENT_PROVIDER !== "sandbox") throw new AppError("FORBIDDEN", "Sandbox payments are disabled.");
  const order = await db.marketplaceOrder.findFirst({ where: { id: i.orderId, buyerId: user.id } });
  if (!order?.paymentRef) throw new AppError("NOT_FOUND", "Order not found.");
  if (i.outcome === "failure") throw new AppError("PROVIDER_ERROR", "Payment declined by the (sandbox) bank. Your items stay reserved for a few minutes — try again.");
  const paymentId = `pay_sbx_${randomCode(14)}`;
  await confirmPayment(user, { orderId: order.id, paymentId, signature: sandboxSignature(order.paymentRef, paymentId) });
  redirect(`/app/orders/${order.id}?paid=1`);
});

export const cancelOrderAction = authedAction(z.object({ orderId: zs.id, reason: zs.req(200, "Tell us why") }), async (user, i) => {
  await cancelOrder(user, i.orderId, i.reason);
  return "Order cancelled. Any payment will be refunded to the original method.";
}, { revalidate: ["/app/orders"] });

export const reviewAction = authedAction(
  z.object({ productId: zs.id, orderId: zs.id, rating: z.coerce.number().int().min(1).max(5), title: zs.optional(80), body: zs.optional(1000) }),
  async (user, i) => {
    await addReview(user, { productId: i.productId, orderId: i.orderId, rating: i.rating, title: i.title ?? undefined, body: i.body ?? undefined });
    return "Thanks for your review!";
  },
  { revalidate: ["/shop", "/app/orders"] },
);
