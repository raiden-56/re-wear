"use server";

import { z } from "zod";
import { authedAction, zs } from "@/server/action";
import { captureDoorstepApproval, completePickup, recordWeighing, resendApprovalCode, startTrip, verifyArrival } from "@/server/services/collection";
import { markBookingFailed } from "@/server/services/booking";

const rev = { revalidate: ["/collector"] };

export const startTripAction = authedAction(z.object({ bookingId: zs.id }), async (u, i) => {
  await startTrip(u, i.bookingId);
  return "Trip started — customer notified.";
}, rev);

export const verifyArrivalAction = authedAction(
  z.object({ bookingId: zs.id, code: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit booking code"), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }),
  async (u, i) => {
    await verifyArrival(u, i.bookingId, i.code, { lat: i.lat, lng: i.lng });
    return "Booking verified. You can start weighing.";
  },
  rev,
);

/** Collectors submit weights only — never rates or amounts. */
export const recordWeighingAction = authedAction(
  z.object({
    payload: z.string().transform((s) =>
      z
        .object({
          bookingId: z.string(),
          grossGrams: z.number().int().positive(),
          tareGrams: z.number().int().min(0),
          rejectedGrams: z.number().int().min(0),
          categoryWeights: z.array(z.object({ categoryId: z.string(), grams: z.number().int().min(0) })).min(1),
          scalePhotoKey: z.string().min(1, "Capture the scale photo"),
          evidenceKeys: z.array(z.string()).max(8),
        })
        .parse(JSON.parse(s)),
    ),
  }),
  async (u, { payload }) => {
    const r = await recordWeighing(u, payload);
    return r.valuation ? "Weights recorded. Valuation sent to the customer." : "Donation weighed.";
  },
  rev,
);

export const doorstepApprovalAction = authedAction(z.object({ bookingId: zs.id, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit approval code") }), async (u, i) => {
  await captureDoorstepApproval(u, i.bookingId, i.code);
  return "Customer approved the valuation.";
}, rev);

export const resendCodeAction = authedAction(z.object({ bookingId: zs.id }), async (u, i) => {
  await resendApprovalCode(u, i.bookingId);
  return "Approval code re-sent to the customer.";
}, rev);

export const completePickupAction = authedAction(z.object({ bookingId: zs.id, evidenceKeys: zs.list }), async (u, i) => {
  await completePickup(u, i.bookingId, i.evidenceKeys);
  return "Pickup completed. Great work!";
}, rev);

export const failPickupAction = authedAction(z.object({ bookingId: zs.id, reason: zs.req(200, "Choose a reason") }), async (u, i) => {
  await markBookingFailed(u, i.bookingId, i.reason);
  return "Pickup marked as failed.";
}, rev);
