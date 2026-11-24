import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/server/http";
import { handlePayoutWebhook } from "@/server/services/payouts";

/**
 * Payout provider webhook (RazorpayX `payout.*` events, or the sandbox equivalent).
 * The raw body is verified with HMAC-SHA256 before parsing; events are deduplicated.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const signature = req.headers.get("x-razorpay-signature") ?? req.headers.get("x-rewear-signature");
    const r = await handlePayoutWebhook(raw, signature);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return apiError(e);
  }
}
