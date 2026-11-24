import { db } from "../db";
import { env } from "../env";
import { hmacSha256, randomCode, safeEqual } from "../domain/codes";
import { AppError } from "../domain/errors";

/**
 * UPI payout provider abstraction.
 *
 *  - `sandbox`   — deterministic local simulator with persistent state (development & tests).
 *  - `razorpayx` — RazorpayX Payouts API (composite payout to a VPA).
 *
 * Every create call carries an idempotency key; the provider must return the SAME payout
 * for a repeated key, which is what makes retries safe against duplicate customer payments.
 */
export type ProviderPayoutStatus = "processing" | "processed" | "failed" | "reversed" | "queued";

export type ProviderPayout = {
  reference: string;
  status: ProviderPayoutStatus;
  utr?: string | null;
  failureReason?: string | null;
  raw?: unknown;
};

export interface PayoutProvider {
  name: string;
  validateVpa(vpa: string, fallbackName?: string | null): Promise<{ valid: boolean; nameAtBank?: string | null }>;
  createPayout(input: { idempotencyKey: string; amountPaise: number; vpa: string; name: string; narration: string; referenceId: string }): Promise<ProviderPayout>;
  fetchPayout(reference: string): Promise<ProviderPayout>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string): { eventId: string; type: string; payout: ProviderPayout };
}

export const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{2,64}$/;

// ───────────────────────── Sandbox ─────────────────────────

/**
 * Sandbox rules (so every path can be exercised):
 *   VPA containing "fail"    → payout fails (e.g. "fail@okaxis")
 *   VPA containing "reverse" → payout processes then reverses
 *   VPA containing "invalid" → VPA validation fails
 *   otherwise                → processing, then processed ~3s later
 */
class SandboxPayoutProvider implements PayoutProvider {
  name = "sandbox";

  async validateVpa(vpa: string, fallbackName?: string | null) {
    if (!VPA_PATTERN.test(vpa) || vpa.includes("invalid")) return { valid: false };
    return { valid: true, nameAtBank: fallbackName ?? "ReWear Customer" };
  }

  async createPayout(input: { idempotencyKey: string; amountPaise: number; vpa: string }) {
    const existing = await db.sandboxTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return this.toPayout(existing);
    const tx = await db.sandboxTransaction.create({
      data: {
        kind: "PAYOUT",
        idempotencyKey: input.idempotencyKey,
        reference: `pout_sbx_${randomCode(14)}`,
        amountPaise: input.amountPaise,
        destination: input.vpa,
        status: input.vpa.includes("fail") ? "failed" : "processing",
      },
    });
    return this.toPayout(tx);
  }

  async fetchPayout(reference: string) {
    const tx = await db.sandboxTransaction.findUnique({ where: { reference } });
    if (!tx) throw new AppError("PROVIDER_ERROR", "Unknown payout reference");
    if (tx.status === "processing" && Date.now() - tx.createdAt.getTime() > 3000) {
      const next = tx.destination?.includes("reverse") ? "reversed" : "processed";
      const updated = await db.sandboxTransaction.update({
        where: { id: tx.id },
        data: { status: next, utr: next === "processed" ? `SBX${Date.now().toString().slice(-9)}` : null },
      });
      return this.toPayout(updated);
    }
    return this.toPayout(tx);
  }

  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) return false;
    return safeEqual(hmacSha256(env().PAYOUT_WEBHOOK_SECRET, rawBody), signature);
  }

  parseWebhook(rawBody: string) {
    const body = JSON.parse(rawBody);
    return { eventId: String(body.id), type: String(body.event), payout: mapRazorpayEntity(body.payload?.payout?.entity ?? {}) };
  }

  private toPayout(tx: { reference: string; status: string; utr: string | null }): ProviderPayout {
    return {
      reference: tx.reference,
      status: tx.status as ProviderPayoutStatus,
      utr: tx.utr,
      failureReason: tx.status === "failed" ? "Beneficiary bank rejected the transfer (sandbox)" : null,
    };
  }
}

// ───────────────────────── RazorpayX ─────────────────────────

function mapRazorpayEntity(entity: Record<string, unknown>): ProviderPayout {
  const status = String(entity.status ?? "processing");
  const mapped: ProviderPayoutStatus =
    status === "processed" ? "processed" : status === "reversed" ? "reversed" : ["failed", "rejected", "cancelled"].includes(status) ? "failed" : status === "queued" ? "queued" : "processing";
  const details = entity.status_details as { description?: string } | undefined;
  return { reference: String(entity.id ?? ""), status: mapped, utr: (entity.utr as string) ?? null, failureReason: details?.description ?? null, raw: entity };
}

class RazorpayXPayoutProvider implements PayoutProvider {
  name = "razorpayx";

  private auth() {
    const e = env();
    if (!e.RAZORPAYX_KEY_ID || !e.RAZORPAYX_KEY_SECRET || !e.RAZORPAYX_ACCOUNT_NUMBER) throw new AppError("PROVIDER_ERROR", "RazorpayX is not configured");
    return { header: "Basic " + Buffer.from(`${e.RAZORPAYX_KEY_ID}:${e.RAZORPAYX_KEY_SECRET}`).toString("base64"), account: e.RAZORPAYX_ACCOUNT_NUMBER };
  }

  async validateVpa(vpa: string) {
    // Composite validation requires a funded account; we validate format here and rely on
    // the fund-account validation endpoint in production deployments.
    return { valid: VPA_PATTERN.test(vpa), nameAtBank: null };
  }

  async createPayout(input: { idempotencyKey: string; amountPaise: number; vpa: string; name: string; narration: string; referenceId: string }) {
    const { header, account } = this.auth();
    const res = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: { authorization: header, "content-type": "application/json", "X-Payout-Idempotency": input.idempotencyKey },
      body: JSON.stringify({
        account_number: account,
        amount: input.amountPaise,
        currency: "INR",
        mode: "UPI",
        purpose: "payout",
        queue_if_low_balance: true,
        reference_id: input.referenceId,
        narration: input.narration.slice(0, 30),
        fund_account: { account_type: "vpa", vpa: { address: input.vpa }, contact: { name: input.name, type: "customer", reference_id: input.referenceId } },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new AppError("PROVIDER_ERROR", body?.error?.description ?? `RazorpayX error ${res.status}`);
    return mapRazorpayEntity(body);
  }

  async fetchPayout(reference: string) {
    const { header } = this.auth();
    const res = await fetch(`https://api.razorpay.com/v1/payouts/${reference}`, { headers: { authorization: header } });
    const body = await res.json();
    if (!res.ok) throw new AppError("PROVIDER_ERROR", body?.error?.description ?? `RazorpayX error ${res.status}`);
    return mapRazorpayEntity(body);
  }

  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) return false;
    return safeEqual(hmacSha256(env().PAYOUT_WEBHOOK_SECRET, rawBody), signature);
  }

  parseWebhook(rawBody: string) {
    const body = JSON.parse(rawBody);
    return { eventId: String(body.id ?? `${body.event}:${body.payload?.payout?.entity?.id}:${body.created_at}`), type: String(body.event), payout: mapRazorpayEntity(body.payload?.payout?.entity ?? {}) };
  }
}

let provider: PayoutProvider | null = null;
export function payoutProvider(): PayoutProvider {
  if (!provider) provider = env().PAYOUT_PROVIDER === "razorpayx" ? new RazorpayXPayoutProvider() : new SandboxPayoutProvider();
  return provider;
}

/** Test hook */
export function setPayoutProvider(p: PayoutProvider | null) {
  provider = p;
}
