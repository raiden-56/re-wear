import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { apiError } from "@/server/http";
import { readStoredFile } from "@/server/providers/storage";

const STAFF = new Set(["ADMIN", "SUPER_ADMIN", "WAREHOUSE_MANAGER"]);

/** Private files: owner, staff, assigned collector, or the customer whose booking references the file. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  try {
    const key = (await ctx.params).key.join("/");
    const meta = await db.storedFile.findUnique({ where: { key } });
    if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Published marketplace photos are the only public files.
    if (meta.isPublic) {
      const file = await readStoredFile(key);
      return new NextResponse(new Uint8Array(file.body), { headers: { "Content-Type": file.contentType, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
    }
    const user = await requireUser();
    let allowed = meta.ownerId === user.id || STAFF.has(user.role);
    if (!allowed && user.role === "CUSTOMER") {
      allowed = !!(await db.booking.findFirst({
        where: { customerId: user.id, OR: [{ photoKeys: { has: key } }, { weighings: { some: { OR: [{ scalePhotoKey: key }, { evidenceKeys: { has: key } }] } } }] },
        select: { id: true },
      }));
    }
    if (!allowed && user.role === "COLLECTOR") {
      allowed = !!(await db.booking.findFirst({ where: { photoKeys: { has: key }, assignments: { some: { active: true, collector: { userId: user.id } } } }, select: { id: true } }));
    }
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const file = await readStoredFile(key);
    return new NextResponse(new Uint8Array(file.body), {
      headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
    });
  } catch (e) {
    return apiError(e);
  }
}
