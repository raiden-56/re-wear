import { db } from "../db";
import { env } from "../env";
import { hmacSha256, randomCode, safeEqual } from "../domain/codes";
import { AppError } from "../domain/errors";

/** Customer payment collection (marketplace checkout) and refunds. */
export interface PaymentProvider {
  name: string;
  createOrder(input: { amountPaise: number; receipt: string }): Promise<{ orderRef: string; keyId?: string }>;
  verifyPayment(input: { orderRef: string; paymentId: string; signature: string }): boolean;
  refund(input: { paymentRef: string; amountPaise: number; idempotencyKey: string }): Promise<{ refundRef: string }>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

class SandboxPaymentProvider implements PaymentProvider {
  name = "sandbox";
  async createOrder(input: { amountPaise: number; receipt: string }) {
    const tx = await db.sandboxTransaction.create({
      data: { kind: "PAYMENT", idempotencyKey: `order:${input.receipt}:${randomCode(6)}`, reference: `order_sbx_${randomCode(14)}`, amountPaise: input.amountPaise, status: "created" },
    });
    return { orderRef: tx.reference };
  }
  /** Sandbox signature = HMAC(secret, orderRef|paymentId) — computed by our sandbox checkout page server-side. */
  verifyPayment({ orderRef, paymentId, signature }: { orderRef: string; paymentId: string; signature: string }) {
    return safeEqual(hmacSha256(env().PAYMENT_WEBHOOK_SECRET, `${orderRef}|${paymentId}`), signature);
  }
  async refund(input: { paymentRef: string; amountPaise: number; idempotencyKey: string }) {
    const existing = await db.sandboxTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { refundRef: existing.reference };
    const tx = await db.sandboxTransaction.create({
      data: { kind: "REFUND", idempotencyKey: input.idempotencyKey, reference: `rfnd_sbx_${randomCode(14)}`, amountPaise: input.amountPaise, destination: input.paymentRef, status: "processed" },
    });
    return { refundRef: tx.reference };
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    return !!signature && safeEqual(hmacSha256(env().PAYMENT_WEBHOOK_SECRET, rawBody), signature);
  }
}

class RazorpayPaymentProvider implements PaymentProvider {
  name = "razorpay";
  private auth() {
    const e = env();
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) throw new AppError("PROVIDER_ERROR", "Razorpay is not configured");
    return { keyId: e.RAZORPAY_KEY_ID, secret: e.RAZORPAY_KEY_SECRET, header: "Basic " + Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString("base64") };
  }
  async createOrder(input: { amountPaise: number; receipt: string }) {
    const { header, keyId } = this.auth();
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: header, "content-type": "application/json" },
      body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt }),
    });
    const body = await res.json();
    if (!res.ok) throw new AppError("PROVIDER_ERROR", body?.error?.description ?? "Could not create payment order");
    return { orderRef: body.id as string, keyId };
  }
  verifyPayment({ orderRef, paymentId, signature }: { orderRef: string; paymentId: string; signature: string }) {
    return safeEqual(hmacSha256(this.auth().secret, `${orderRef}|${paymentId}`), signature);
  }
  async refund(input: { paymentRef: string; amountPaise: number; idempotencyKey: string }) {
    const { header } = this.auth();
    const res = await fetch(`https://api.razorpay.com/v1/payments/${input.paymentRef}/refund`, {
      method: "POST",
      headers: { authorization: header, "content-type": "application/json", "X-Refund-Idempotency": input.idempotencyKey },
      body: JSON.stringify({ amount: input.amountPaise, speed: "normal" }),
    });
    const body = await res.json();
    if (!res.ok) throw new AppError("PROVIDER_ERROR", body?.error?.description ?? "Refund failed");
    return { refundRef: body.id as string };
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    return !!signature && safeEqual(hmacSha256(env().PAYMENT_WEBHOOK_SECRET, rawBody), signature);
  }
}

let provider: PaymentProvider | null = null;
export function paymentProvider(): PaymentProvider {
  if (!provider) provider = env().PAYMENT_PROVIDER === "razorpay" ? new RazorpayPaymentProvider() : new SandboxPaymentProvider();
  return provider;
}
