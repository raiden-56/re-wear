"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authedAction, zs } from "@/server/action";
import { registerBusiness } from "@/server/services/b2b";
import { acknowledgeDonation, confirmRecyclerReceipt, registerRecycler } from "@/server/services/partners";
import { cancelPurchaseOrder, confirmPurchaseOrder, counterOffer, markDelivered, requestPurchase } from "@/server/services/b2b";

export const registerBusinessAction = authedAction(
  z.object({
    legalName: zs.req(160, "Legal name is required"),
    tradeName: zs.optional(160),
    businessType: z.enum(["THRIFT_STORE", "WHOLESALER", "TEXTILE_RECYCLER", "UPCYCLER", "GARMENT_MANUFACTURER", "NGO"]),
    gstin: zs.optional(15),
    pan: zs.optional(10),
    contactEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
    addressLine: zs.req(200, "Address is required"),
    city: zs.req(60, "City is required"),
    state: zs.req(60, "State is required"),
    pincode: z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
  }),
  async (user, i) => {
    await registerBusiness(user, { ...i, tradeName: i.tradeName ?? undefined, gstin: i.gstin ?? undefined, pan: i.pan ?? undefined, contactEmail: i.contactEmail || undefined, contactPhone: user.phone ?? undefined });
    redirect("/business");
  },
);

export const registerRecyclerAction = authedAction(
  z.object({ name: zs.req(160), licenseNumber: zs.optional(60), pollutionCertNo: zs.optional(60), city: zs.req(60), materialsAccepted: zs.list }),
  async (user, i) => {
    await registerRecycler(user, { name: i.name, licenseNumber: i.licenseNumber ?? undefined, pollutionCertNo: i.pollutionCertNo ?? undefined, city: i.city, materialsAccepted: i.materialsAccepted });
    redirect("/recycler");
  },
);

export const requestPurchaseAction = authedAction(
  z.object({ listingId: zs.id, kg: z.coerce.number().positive("Enter a quantity"), offeredPrice: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)), message: zs.optional(500), deliveryAddress: zs.req(300, "Delivery address is required") }),
  async (user, i) => {
    const po = await requestPurchase(user, { listingId: i.listingId, grams: Math.round(i.kg * 1000), offeredPricePerKgPaise: i.offeredPrice ? Math.round(i.offeredPrice * 100) : null, message: i.message ?? undefined, deliveryAddress: i.deliveryAddress });
    redirect(`/business/orders/${po.id}`);
  },
);

export const buyerCounterAction = authedAction(
  z.object({ poId: zs.id, price: z.coerce.number().positive(), kg: z.coerce.number().positive(), message: zs.optional(500) }),
  async (user, i) => {
    await counterOffer(user, i.poId, Math.round(i.price * 100), Math.round(i.kg * 1000), i.message ?? undefined);
    return "Offer sent.";
  },
  { revalidate: ["/business"] },
);

export const buyerAcceptAction = authedAction(z.object({ poId: zs.id }), async (user, i) => {
  await confirmPurchaseOrder(user, i.poId);
  return "Order confirmed. Your invoice is ready.";
}, { revalidate: ["/business"] });

export const buyerCancelAction = authedAction(z.object({ poId: zs.id, reason: zs.req(200) }), async (user, i) => {
  await cancelPurchaseOrder(user, i.poId, i.reason);
  return "Request cancelled.";
}, { revalidate: ["/business"] });

export const buyerDeliveredAction = authedAction(z.object({ poId: zs.id }), async (user, i) => {
  await markDelivered(user, i.poId);
  return "Marked as delivered. Thank you!";
}, { revalidate: ["/business"] });

export const recyclerReceiptAction = authedAction(z.object({ dispatchId: zs.id, receivedKg: z.coerce.number().positive() }), async (user, i) => {
  await confirmRecyclerReceipt(user, i.dispatchId, Math.round(i.receivedKg * 1000));
  return "Receipt confirmed. Settlement will be processed.";
}, { revalidate: ["/recycler"] });

export const acknowledgeDonationAction = authedAction(z.object({ donationId: zs.id, note: zs.req(500, "Add a short note for the donor") }), async (user, i) => {
  await acknowledgeDonation(user, i.donationId, i.note);
  return "Acknowledged — the donor has been notified.";
}, { revalidate: ["/partner"] });
