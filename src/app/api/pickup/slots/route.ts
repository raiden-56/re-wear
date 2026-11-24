import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { apiError, noStore } from "@/server/http";
import { availableSlots, findServiceArea } from "@/server/services/serviceability";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const addressId = req.nextUrl.searchParams.get("addressId") ?? "";
    const date = req.nextUrl.searchParams.get("date") ?? "";
    const address = await db.address.findFirst({ where: { id: addressId, userId: user.id, deletedAt: null } });
    if (!address) throw new AppError("NOT_FOUND", "Address not found.");
    const area = address.serviceAreaId ? await db.serviceArea.findFirst({ where: { id: address.serviceAreaId, active: true } }) : await findServiceArea(address.pincode);
    if (!area) return NextResponse.json({ serviceable: false, slots: [] }, { headers: noStore });
    const slots = await availableSlots(area.id, date);
    return NextResponse.json(
      { serviceable: true, area: { id: area.id, name: area.name, city: area.city, minimumKgPolicy: area.minimumKgPolicy, policyNote: area.policyNote }, slots },
      { headers: noStore },
    );
  } catch (e) {
    return apiError(e);
  }
}
