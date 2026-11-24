"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authedAction, zs } from "@/server/action";
import { createUnitFromLot, decideAdjustment, inspectItem, receiveBatch, requestAdjustment, sortBatch, transferItem } from "@/server/services/warehouse";
import { reviseValuation } from "@/server/services/valuation";
import { createProduct, setPublished, updateFulfilment, updateProduct } from "@/server/services/marketplace";
import { createRecyclerDispatch, handOverDonation, settleRecyclerDispatch } from "@/server/services/partners";

const SORT_GRADES = ["PREMIUM_REUSABLE", "STANDARD_REUSABLE", "REPAIRABLE", "RECYCLABLE", "UPCYCLING", "REJECTED"] as const;
const rev = { revalidate: ["/warehouse", "/admin"] };

export const receiveBatchAction = authedAction(
  z.object({ bookingId: zs.id, warehouseId: zs.id, receivedKg: z.coerce.number().positive("Enter the received weight"), notes: zs.optional(300) }),
  async (u, i) => {
    const r = await receiveBatch(u, { bookingId: i.bookingId, warehouseId: i.warehouseId, receivedGrams: Math.round(i.receivedKg * 1000), notes: i.notes ?? undefined });
    return { message: r.flagged ? `Batch ${r.batch.code} received — weight variance flagged for re-inspection.` : `Batch ${r.batch.code} received.`, data: { batchId: r.batch.id } };
  },
  rev,
);

export const sortBatchAction = authedAction(
  z.object({
    batchId: zs.id,
    finalize: zs.bool,
    lines: z.string().transform((s) => z.array(z.object({ categoryId: z.string(), grade: z.enum(SORT_GRADES), kg: z.number().positive(), notes: z.string().optional() })).min(1, "Add at least one sorted line").parse(JSON.parse(s))),
  }),
  async (u, i) => {
    await sortBatch(u, { batchId: i.batchId, finalize: i.finalize, lines: i.lines.map((l) => ({ categoryId: l.categoryId, grade: l.grade, grams: Math.round(l.kg * 1000), notes: l.notes })) });
    return i.finalize ? "Batch sorted and closed." : "Sorted lines saved.";
  },
  rev,
);

export const reinspectAction = authedAction(
  z.object({
    payload: z.string().transform((s) =>
      z.object({ bookingId: z.string(), grossGrams: z.number().int().positive(), tareGrams: z.number().int().min(0), rejectedGrams: z.number().int().min(0), categoryWeights: z.array(z.object({ categoryId: z.string(), grams: z.number().int().min(0) })).min(1), reason: z.string().min(5, "Explain the revision") }).parse(JSON.parse(s)),
    ),
  }),
  async (u, { payload }) => {
    await reviseValuation(u, payload);
    return "Revised valuation sent to the customer for approval.";
  },
  rev,
);

export const createUnitAction = authedAction(
  z.object({ lotId: zs.id, title: zs.req(120), brand: zs.optional(60), size: zs.req(20), condition: z.enum(["EXCELLENT", "GOOD", "FAIR"]), grams: z.coerce.number().int().positive(), photoKeys: zs.list }),
  async (u, i) => {
    const unit = await createUnitFromLot(u, { ...i, brand: i.brand ?? undefined });
    redirect(`/warehouse/inventory/${unit.id}`);
  },
);

export const inspectItemAction = authedAction(z.object({ itemId: zs.id, result: z.enum(["PASSED", "FAILED", "NEEDS_REPAIR"]), notes: zs.optional(500) }), async (u, i) => {
  await inspectItem(u, { itemId: i.itemId, result: i.result, notes: i.notes ?? undefined });
  return "Inspection recorded.";
}, rev);

export const transferAction = authedAction(z.object({ itemId: zs.id, toWarehouseId: zs.id, reason: zs.optional(200) }), async (u, i) => {
  await transferItem(u, { itemId: i.itemId, toWarehouseId: i.toWarehouseId, reason: i.reason ?? undefined });
  return "Transfer recorded.";
}, rev);

export const adjustmentAction = authedAction(z.object({ itemId: zs.id, deltaKg: z.coerce.number().refine((v) => v !== 0, "Cannot be zero"), reason: zs.req(300) }), async (u, i) => {
  await requestAdjustment(u, { itemId: i.itemId, deltaGrams: Math.round(i.deltaKg * 1000), reason: i.reason });
  return "Adjustment submitted for approval.";
}, rev);

export const decideAdjustmentAction = authedAction(z.object({ movementId: zs.id, approve: zs.bool }), async (u, i) => {
  await decideAdjustment(u, i.movementId, i.approve);
  return i.approve ? "Adjustment approved and posted." : "Adjustment rejected.";
}, rev);

export const createProductAction = authedAction(
  z.object({
    inventoryItemId: zs.id,
    name: zs.req(120),
    brand: zs.optional(60),
    categoryId: zs.id,
    gender: zs.optional(20),
    size: zs.req(20),
    condition: z.enum(["EXCELLENT", "GOOD", "FAIR"]),
    description: zs.req(2000, "Describe the garment honestly, including any wear"),
    price: z.coerce.number().positive("Enter a selling price"),
    mrp: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
    photoUrls: z.string().transform((s) => s.split(/\s+/).map((x) => x.trim()).filter(Boolean)),
    photoKeys: zs.list,
  }),
  async (u, i) => {
    const photos = [...i.photoKeys.map((k) => `/api/files/${k}`), ...i.photoUrls.filter((x) => x.startsWith("https://"))];
    const p = await createProduct(u, { inventoryItemId: i.inventoryItemId, name: i.name, brand: i.brand ?? undefined, categoryId: i.categoryId, gender: i.gender ?? undefined, size: i.size, condition: i.condition, description: i.description, pricePaise: Math.round(i.price * 100), mrpPaise: i.mrp ? Math.round(i.mrp * 100) : null, photoUrls: photos });
    redirect(`/warehouse/listings?created=${p.id}`);
  },
);

export const updateProductAction = authedAction(z.object({ id: zs.id, price: z.coerce.number().positive(), description: zs.req(2000) }), async (u, i) => {
  await updateProduct(u, i.id, { pricePaise: Math.round(i.price * 100), description: i.description });
  return "Listing updated.";
}, { revalidate: ["/warehouse", "/shop", "/admin"] });

export const publishAction = authedAction(z.object({ id: zs.id, publish: zs.bool }), async (u, i) => {
  await setPublished(u, i.id, i.publish);
  return i.publish ? "Listing published." : "Listing unpublished.";
}, { revalidate: ["/warehouse", "/shop", "/admin"] });

export const fulfilmentAction = authedAction(z.object({ orderId: zs.id, to: z.enum(["PACKED", "SHIPPED", "DELIVERED", "CANCELLED"]), courier: zs.optional(60), trackingNumber: zs.optional(60) }), async (u, i) => {
  await updateFulfilment(u, i.orderId, i.to, { courier: i.courier ?? undefined, trackingNumber: i.trackingNumber ?? undefined });
  return `Order marked ${i.to.toLowerCase()}.`;
}, { revalidate: ["/warehouse", "/admin"] });

export const recyclerDispatchAction = authedAction(z.object({ partnerId: zs.id, itemIds: zs.list, rate: z.coerce.number().positive(), vehicleNumber: zs.optional(20) }), async (u, i) => {
  const d = await createRecyclerDispatch(u, { partnerId: i.partnerId, itemIds: i.itemIds, ratePerKgPaise: Math.round(i.rate * 100), vehicleNumber: i.vehicleNumber ?? undefined });
  return `Dispatch ${d.code} created.`;
}, rev);

export const settleDispatchAction = authedAction(z.object({ dispatchId: zs.id, settlementRef: zs.req(60, "Enter the bank reference") }), async (u, i) => {
  await settleRecyclerDispatch(u, i.dispatchId, i.settlementRef);
  return "Settlement recorded.";
}, rev);

export const handoverDonationAction = authedAction(z.object({ donationId: zs.id }), async (u, i) => {
  await handOverDonation(u, i.donationId);
  return "Donation handed over; receipt issued.";
}, rev);
