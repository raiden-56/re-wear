import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { apiError, noStore } from "@/server/http";
import { quote } from "@/server/services/pricing";
import { findServiceArea } from "@/server/services/serviceability";

const schema = z.object({
  channel: z.enum(["KG_BUYBACK", "PREMIUM_RESALE", "RECYCLING", "DONATION"]),
  addressId: z.string().optional(),
  items: z.array(z.object({ categoryId: z.string(), grams: z.number().int().positive().max(500_000) })).min(1).max(13),
});

/** Server-side estimate. The client never supplies a rate or an amount. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    let area: { id: string; city: string } | null = null;
    if (input.addressId) {
      const address = await db.address.findFirst({ where: { id: input.addressId, userId: user.id, deletedAt: null } });
      if (address) area = address.serviceAreaId ? await db.serviceArea.findUnique({ where: { id: address.serviceAreaId } }) : await findServiceArea(address.pincode);
    }
    const q = await quote({ channel: input.channel, serviceAreaId: area?.id, city: area?.city, items: input.items });
    return NextResponse.json({ ...q, pickupFeePaise: 0 }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
