"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { clientIp } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { toActionError, formToObject, type ActionState } from "@/server/action";
import { checkServiceability } from "@/server/services/serviceability";
import { audit } from "@/server/audit";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional(),
  topic: z.enum(["general", "apartment", "corporate", "b2b", "recycler", "ngo", "press"]),
  message: z.string().trim().min(10, "Please add a few more details").max(2000),
  website: z.string().max(0).optional(), // honeypot
});

export async function submitContact(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = contactSchema.parse(formToObject(fd));
    await enforceRateLimit(`contact:${await clientIp()}`, 5, 3600);
    const req = await db.contactRequest.create({ data: { name: input.name, email: input.email || null, phone: input.phone || null, topic: input.topic, message: input.message } });
    await audit(db, null, "contact.create", "ContactRequest", req.id);
    return { ok: true, message: "Thanks — our team will get back to you within one working day.", ts: Date.now() };
  } catch (e) {
    return toActionError(e);
  }
}

export async function checkPincode(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const pincode = z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode").parse(fd.get("pincode"));
    await enforceRateLimit(`pincode:${await clientIp()}`, 60, 3600);
    const r = await checkServiceability(pincode);
    return r.serviceable
      ? { ok: true, message: `Great news — we pick up in ${r.area.zone}, ${r.area.city}.`, data: { serviceable: true, area: r.area }, ts: Date.now() }
      : { ok: true, data: { serviceable: false }, message: "We don't serve this pincode yet.", ts: Date.now() };
  } catch (e) {
    return toActionError(e);
  }
}
