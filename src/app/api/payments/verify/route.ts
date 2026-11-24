import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { apiError } from "@/server/http";
import { confirmPayment } from "@/server/services/marketplace";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }).parse(await req.json());
    await confirmPayment(user, input);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
