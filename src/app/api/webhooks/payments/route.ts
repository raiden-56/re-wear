import { NextResponse, type NextRequest } from "next/server";
import { db, isUniqueViolation } from "@/server/db";
import { apiError } from "@/server/http";
import { paymentProvider } from "@/server/providers/payment";
import { confirmPayment } from "@/server/services/marketplace";
import { SYSTEM_ACTOR } from "@/server/audit";
import { hmacSha256 } from "@/server/domain/codes";
import { env } from "@/server/env";

/**
 * Customer-payment webhook (Razorpay `payment.captured`). Covers the case where the
 * browser closes before the client-side callback reaches us.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const provider = paymentProvider();
    if (!provider.verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    const body = JSON.parse(raw);
    const eventId = String(req.headers.get("x-razorpay-event-id") ?? body.id ?? `${body.event}:${body.created_at}`);
    try {
      await db.webhookEvent.create({ data: { provider: provider.name, eventId, type: String(body.event), payload: body } });
    } catch (e) {
      if (isUniqueViolation(e)) return NextResponse.json({ ok: true, duplicate: true });
      throw e;
    }
    if (body.event === "payment.captured") {
      const entity = body.payload?.payment?.entity;
      const order = await db.marketplaceOrder.findUnique({ where: { paymentRef: entity?.order_id } });
      if (order && order.status === "PENDING_PAYMENT") {
        // Webhook signature already proves authenticity; derive the checkout signature server-side.
        const sig = hmacSha256(provider.name === "razorpay" ? env().RAZORPAY_KEY_SECRET! : env().PAYMENT_WEBHOOK_SECRET, `${order.paymentRef}|${entity.id}`);
        await confirmPayment(SYSTEM_ACTOR, { orderId: order.id, paymentId: entity.id, signature: sig });
      }
    }
    await db.webhookEvent.update({ where: { provider_eventId: { provider: provider.name, eventId } }, data: { processedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
