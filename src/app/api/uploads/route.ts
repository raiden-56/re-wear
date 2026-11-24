import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { apiError, noStore } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { storeUpload } from "@/server/providers/storage";

const PURPOSES = ["BOOKING_PHOTO", "SCALE_PHOTO", "COLLECTION_EVIDENCE", "INVENTORY_PHOTO", "INSPECTION_PHOTO", "SUPPORT"] as const;
const STAFF_ONLY = new Set(["SCALE_PHOTO", "COLLECTION_EVIDENCE", "INVENTORY_PHOTO", "INSPECTION_PHOTO"]);

/** Secure image upload: auth, rate limit, size cap, magic-byte type check, private storage. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await enforceRateLimit(`upload:${user.id}`, 60, 3600, "Upload limit reached. Try again later.");
    const form = await req.formData();
    const purpose = z.enum(PURPOSES).parse(form.get("purpose"));
    if (STAFF_ONLY.has(purpose) && user.role === "CUSTOMER") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 422 });
    const key = await storeUpload(file, user.id, purpose);
    return NextResponse.json({ key, url: `/api/files/${key}` }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
