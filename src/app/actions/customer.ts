"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authedAction, zs } from "@/server/action";
import { createBooking, cancelBooking, rescheduleBooking } from "@/server/services/booking";
import { respondToValuation } from "@/server/services/valuation";
import { addUpiAccount, removeUpi, setPrimaryUpi } from "@/server/services/payouts";
import { deleteAddress, deleteMyAccount, saveAddress, updateProfile } from "@/server/services/accounts";
import { createTicket, replyTicket } from "@/server/services/ops";
import { destroySession } from "@/server/auth/session";

const bookingPayload = z.object({
  channel: z.enum(["KG_BUYBACK", "PREMIUM_RESALE", "RECYCLING", "DONATION"]),
  items: z.array(z.object({ categoryId: z.string(), grams: z.number().int().positive() })).min(1, "Select at least one category"),
  bagCount: z.number().int().min(1).max(50),
  instructions: z.string().max(500).optional().nullable(),
  photoKeys: z.array(z.string().max(200)).max(6).default([]),
  addressId: z.string().min(1, "Choose an address"),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  slotId: z.string().min(1, "Choose a time slot"),
  donationPartnerId: z.string().optional().nullable(),
});

export const createBookingAction = authedAction(
  z.object({ payload: z.string().transform((s, ctx) => {
    try {
      return bookingPayload.parse(JSON.parse(s));
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof z.ZodError ? e.issues[0].message : "Invalid booking" });
      return z.NEVER;
    }
  }) }),
  async (user, { payload }) => {
    // Note: no pickup fee is accepted from the client — the service hard-codes zero.
    const b = await createBooking(user, payload);
    return { message: `Free pickup booked · ${b.code}`, data: { id: b.id, code: b.code } };
  },
  { revalidate: ["/app"] },
);

export const rescheduleAction = authedAction(
  z.object({ bookingId: zs.id, pickupDate: z.string(), slotId: zs.id }),
  async (user, i) => {
    await rescheduleBooking(user, i.bookingId, i.pickupDate, i.slotId);
    return "Pickup rescheduled — still free.";
  },
  { revalidate: ["/app"] },
);

export const cancelBookingAction = authedAction(
  z.object({ bookingId: zs.id, reason: zs.req(300, "Tell us why you're cancelling") }),
  async (user, i) => {
    await cancelBooking(user, i.bookingId, i.reason);
    return "Pickup cancelled.";
  },
  { revalidate: ["/app"] },
);

export const respondValuationAction = authedAction(
  z.object({ bookingId: zs.id, valuationId: zs.id, decision: z.enum(["APPROVE", "REJECT"]), reason: zs.optional(500) }),
  async (user, i) => {
    if (i.decision === "REJECT" && !i.reason) throw new z.ZodError([{ code: "custom", path: ["reason"], message: "Tell us what doesn't look right", input: "" }]);
    const r = await respondToValuation(user, { bookingId: i.bookingId, valuationId: i.valuationId, decision: i.decision, reason: i.reason ?? undefined, method: "APP" });
    return i.decision === "APPROVE" ? "Valuation approved. Thank you!" : r.status === "RETURNED" ? "Valuation rejected — your clothes stay with you." : "Valuation rejected. Our team will review it with you.";
  },
  { revalidate: ["/app"] },
);

export const addUpiAction = authedAction(
  z.object({ vpa: zs.req(100, "Enter your UPI ID") }),
  async (user, i) => {
    await addUpiAccount(user, i.vpa);
    return "UPI ID verified and saved.";
  },
  { revalidate: ["/app"] },
);

export const setPrimaryUpiAction = authedAction(z.object({ id: zs.id }), async (user, i) => {
  await setPrimaryUpi(user, i.id);
  return "Primary UPI ID updated.";
}, { revalidate: ["/app"] });

export const removeUpiAction = authedAction(z.object({ id: zs.id }), async (user, i) => {
  await removeUpi(user, i.id);
  return "UPI ID removed.";
}, { revalidate: ["/app"] });

const addressSchema = z.object({
  id: z.string().optional(),
  label: zs.req(30),
  contactName: zs.req(80, "Contact name is required"),
  contactPhone: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: zs.req(160, "House / flat and building is required"),
  line2: zs.optional(160),
  landmark: zs.optional(120),
  city: zs.req(60, "City is required"),
  state: zs.req(60, "State is required"),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("").transform(() => undefined)),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("").transform(() => undefined)),
  isDefault: zs.bool,
});

export const saveAddressAction = authedAction(
  addressSchema,
  async (user, i) => {
    const r = await saveAddress(user, { ...i, id: i.id || undefined, latitude: i.latitude ?? null, longitude: i.longitude ?? null });
    return {
      message: r.serviceable ? "Address saved." : "Address saved — we don't pick up from this pincode yet.",
      data: { id: r.address.id, serviceable: r.serviceable, label: r.address.label, line1: r.address.line1, city: r.address.city, pincode: r.address.pincode },
    };
  },
  { revalidate: ["/app"] },
);

export const deleteAddressAction = authedAction(z.object({ id: zs.id }), async (user, i) => {
  await deleteAddress(user, i.id);
  return "Address removed.";
}, { revalidate: ["/app"] });

export const updateProfileAction = authedAction(
  z.object({
    name: zs.req(80),
    email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
    marketingOptIn: zs.bool,
    whatsappOptIn: zs.bool,
    showOnLeaderboard: zs.bool,
    preferredLanguage: z.enum(["en", "hi", "kn", "mr", "te", "ta"]),
  }),
  async (user, i) => {
    await updateProfile(user, { ...i, email: i.email || null });
    return "Profile updated.";
  },
  { revalidate: ["/app"] },
);

export const deleteAccountAction = authedAction(z.object({ confirm: z.literal("DELETE", { message: "Type DELETE to confirm" }) }), async (user) => {
  await deleteMyAccount(user);
  await destroySession();
  redirect("/");
});

export const createTicketAction = authedAction(
  z.object({ subject: zs.req(140, "Add a subject"), body: zs.req(2000, "Describe the issue"), type: z.enum(["GENERAL", "PAYMENT", "PICKUP", "ORDER"]), bookingId: zs.optional(64) }),
  async (user, i) => {
    const t = await createTicket(user, i);
    return { message: `Ticket ${t.code} created.`, data: { id: t.id } };
  },
  { revalidate: ["/app/support"] },
);

export const replyTicketAction = authedAction(z.object({ ticketId: zs.id, body: zs.req(2000, "Write a reply") }), async (user, i) => {
  await replyTicket(user, i.ticketId, i.body);
  return "Reply sent.";
}, { revalidate: ["/app/support", "/admin/support"] });
