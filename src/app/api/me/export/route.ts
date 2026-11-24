import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/session";
import { apiError } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { exportMyData } from "@/server/services/accounts";

export async function GET() {
  try {
    const user = await requireUser();
    await enforceRateLimit(`export:${user.id}`, 5, 3600);
    const data = await exportMyData(user);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="rewear-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
