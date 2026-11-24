import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/domain/codes";
import { apiError } from "@/server/http";
import { reconcilePayouts } from "@/server/services/payouts";
import { expireReservations } from "@/server/services/marketplace";

/** Scheduled job (e.g. every 5 minutes): payout reconciliation + expired cart reservations. */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [payouts, expired] = await Promise.all([reconcilePayouts(), expireReservations()]);
    return NextResponse.json({ ok: true, payouts, expiredReservations: expired });
  } catch (e) {
    return apiError(e);
  }
}
