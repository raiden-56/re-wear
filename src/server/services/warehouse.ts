import type { ClothingCondition, InventoryItem, MovementType, SortGrade } from "@prisma/client";
import { db, isUniqueViolation, transaction, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { humanCode, randomCode } from "../domain/codes";
import { AppError } from "../domain/errors";
import { variancePercent } from "../domain/weighing";
import { getSetting } from "../settings";

async function movement(
  tx: Tx,
  item: Pick<InventoryItem, "id">,
  data: { type: MovementType; deltaGrams: number; deltaQuantity?: number; actorId: string; referenceType?: string; referenceId?: string; reason?: string; fromWarehouseId?: string; toWarehouseId?: string },
) {
  return tx.inventoryMovement.create({ data: { itemId: item.id, status: "POSTED", deltaQuantity: 0, ...data } });
}

const itemCode = (prefix = "INV") => `${prefix}-${randomCode(8)}`;

/**
 * Receive a completed pickup at a warehouse. Exactly one batch per booking — a second
 * attempt fails on the unique constraint, so inventory can never be duplicated.
 */
export async function receiveBatch(actor: Actor, args: { bookingId: string; warehouseId: string; receivedGrams: number; notes?: string }) {
  assertPermission(actor, "warehouse:receive");
  if (!Number.isInteger(args.receivedGrams) || args.receivedGrams <= 0) throw new AppError("VALIDATION", "Enter the received weight.");
  try {
    return await transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: args.bookingId },
        include: { weighings: { orderBy: { createdAt: "desc" }, take: 1 }, assignments: { orderBy: { assignedAt: "desc" }, take: 1 }, items: true },
      });
      if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
      if (booking.status !== "COMPLETED") throw new AppError("INVALID_STATE", "Only completed pickups can be received.");
      const w = booking.weighings[0];
      if (!w) throw new AppError("INVALID_STATE", "No weighing recorded for this pickup.");
      const wh = await tx.warehouseLocation.findFirst({ where: { id: args.warehouseId, active: true } });
      if (!wh) throw new AppError("VALIDATION", "Choose an active warehouse.");
      const collectedGrams = w.netGrams - w.rejectedGrams;
      const batch = await tx.collectionBatch.create({
        data: {
          code: humanCode("BT"),
          bookingId: booking.id,
          warehouseId: wh.id,
          collectorId: booking.assignments[0]?.collectorId,
          receivedById: actor.id,
          collectedGrams,
          receivedGrams: args.receivedGrams,
          varianceGrams: args.receivedGrams - collectedGrams,
          notes: args.notes,
        },
      });
      const primaryCategory = booking.items[0]?.categoryId ?? (w.categoryWeights as { categoryId: string }[])[0].categoryId;
      const lot = await tx.inventoryItem.create({
        data: { code: itemCode("UNS"), kind: "LOT", grade: "UNSORTED", categoryId: primaryCategory, batchId: batch.id, warehouseId: wh.id, weightGrams: args.receivedGrams, title: `Unsorted — ${booking.code}` },
      });
      await movement(tx, lot, { type: "RECEIVE", deltaGrams: args.receivedGrams, actorId: actor.id, referenceType: "BATCH", referenceId: batch.id, toWarehouseId: wh.id });
      await tx.pickupEvent.create({ data: { bookingId: booking.id, type: "RECEIVED_AT_WAREHOUSE", actorId: actor.id, note: `${wh.name} · ${batch.code}` } });
      await audit(tx, actor, "warehouse.receive", "CollectionBatch", batch.id, { after: { bookingId: booking.id, collectedGrams, receivedGrams: args.receivedGrams } });
      const policy = await getSetting("valuation", tx);
      const flagged = Math.abs(variancePercent(collectedGrams, args.receivedGrams)) > policy.reinspectionVariancePct;
      return { batch, flagged };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "This booking has already been received into a batch.");
    throw e;
  }
}

/** Grade-wise sorting of a batch. Moves weight out of the UNSORTED lot into graded lots. */
export async function sortBatch(actor: Actor, args: { batchId: string; lines: { categoryId: string; grade: SortGrade; grams: number; notes?: string }[]; finalize: boolean }) {
  assertPermission(actor, "warehouse:sort");
  if (args.lines.some((l) => l.grade === "UNSORTED" || !Number.isInteger(l.grams) || l.grams <= 0)) throw new AppError("VALIDATION", "Each line needs a grade and a positive weight.");
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CollectionBatch" WHERE id = ${args.batchId} FOR UPDATE`;
    const batch = await tx.collectionBatch.findUnique({ where: { id: args.batchId } });
    if (!batch) throw new AppError("NOT_FOUND", "Batch not found.");
    if (batch.status === "SORTED" || batch.status === "CLOSED") throw new AppError("INVALID_STATE", "This batch has already been sorted.");
    const unsorted = await tx.inventoryItem.findFirst({ where: { batchId: batch.id, grade: "UNSORTED" } });
    if (!unsorted) throw new AppError("INVALID_STATE", "Batch has no unsorted stock.");
    const total = args.lines.reduce((s, l) => s + l.grams, 0);
    if (total > unsorted.weightGrams) throw new AppError("VALIDATION", `Sorted weight exceeds the ${(unsorted.weightGrams / 1000).toFixed(2)} kg still unsorted.`);

    for (const l of args.lines) {
      let lot = await tx.inventoryItem.findFirst({ where: { batchId: batch.id, grade: l.grade, categoryId: l.categoryId, kind: "LOT" } });
      if (lot) lot = await tx.inventoryItem.update({ where: { id: lot.id }, data: { weightGrams: { increment: l.grams } } });
      else
        lot = await tx.inventoryItem.create({
          data: {
            code: itemCode(l.grade.slice(0, 3)),
            kind: "LOT",
            grade: l.grade,
            categoryId: l.categoryId,
            batchId: batch.id,
            warehouseId: batch.warehouseId,
            weightGrams: l.grams,
            status: l.grade === "REJECTED" ? "SCRAPPED" : "IN_STOCK",
            inspectionPassed: l.grade === "PREMIUM_REUSABLE" || l.grade === "STANDARD_REUSABLE",
          },
        });
      await movement(tx, lot, { type: "SORT_IN", deltaGrams: l.grams, actorId: actor.id, referenceType: "BATCH", referenceId: batch.id });
      await tx.qualityInspection.create({
        data: {
          batchId: batch.id,
          itemId: lot.id,
          inspectorId: actor.id,
          grade: l.grade,
          result: l.grade === "REJECTED" ? "FAILED" : l.grade === "REPAIRABLE" ? "NEEDS_REPAIR" : "PASSED",
          notes: l.notes,
        },
      });
    }
    await tx.inventoryItem.update({ where: { id: unsorted.id }, data: { weightGrams: { decrement: total } } });
    await movement(tx, unsorted, { type: "SORT_OUT", deltaGrams: -total, actorId: actor.id, referenceType: "BATCH", referenceId: batch.id });
    const sortedGrams = batch.sortedGrams + total;
    let status: "SORTING" | "SORTED" = "SORTING";
    if (args.finalize) {
      const residual = unsorted.weightGrams - total;
      const policy = await getSetting("valuation", tx);
      if (residual > 0) {
        // Sorting loss (dust, moisture, tags). Small residuals post directly; larger need approval.
        const needsApproval = residual > Math.max(policy.weightToleranceGrams, Math.round(batch.receivedGrams * 0.02));
        await tx.inventoryMovement.create({
          data: {
            itemId: unsorted.id,
            type: "ADJUSTMENT",
            status: needsApproval ? "PENDING_APPROVAL" : "POSTED",
            deltaGrams: -residual,
            reason: "Sorting loss (moisture / dust / trims)",
            actorId: actor.id,
            referenceType: "BATCH",
            referenceId: batch.id,
          },
        });
        if (!needsApproval) await tx.inventoryItem.update({ where: { id: unsorted.id }, data: { weightGrams: 0, status: "SCRAPPED" } });
      } else {
        await tx.inventoryItem.update({ where: { id: unsorted.id }, data: { status: "SCRAPPED" } });
      }
      status = "SORTED";
    }
    const updated = await tx.collectionBatch.update({
      where: { id: batch.id },
      data: { sortedGrams, status, sortedAt: status === "SORTED" ? new Date() : null, varianceGrams: status === "SORTED" ? sortedGrams - batch.receivedGrams : batch.varianceGrams },
    });
    await audit(tx, actor, "warehouse.sort", "CollectionBatch", batch.id, { after: { lines: args.lines, finalize: args.finalize } });
    return updated;
  });
}

/** Split an individual premium garment out of a premium lot for resale. */
export async function createUnitFromLot(
  actor: Actor,
  args: { lotId: string; title: string; brand?: string; size: string; condition: ClothingCondition; grams: number; photoKeys?: string[]; costPaise?: number },
) {
  assertPermission(actor, "inventory:manage");
  return transaction(async (tx) => {
    const lot = await tx.inventoryItem.findUnique({ where: { id: args.lotId } });
    if (!lot || lot.kind !== "LOT" || lot.grade !== "PREMIUM_REUSABLE") throw new AppError("VALIDATION", "Choose a premium reusable lot.");
    if (args.grams <= 0 || args.grams > lot.weightGrams) throw new AppError("VALIDATION", "Garment weight exceeds the lot's remaining weight.");
    const r = await tx.inventoryItem.updateMany({ where: { id: lot.id, weightGrams: { gte: args.grams } }, data: { weightGrams: { decrement: args.grams } } });
    if (r.count !== 1) throw new AppError("CONFLICT", "Lot weight changed — refresh and retry.");
    await movement(tx, lot, { type: "SORT_OUT", deltaGrams: -args.grams, actorId: actor.id, reason: `Unit: ${args.title}` });
    const unit = await tx.inventoryItem.create({
      data: {
        code: itemCode("PRM"),
        kind: "UNIT",
        grade: "PREMIUM_REUSABLE",
        categoryId: lot.categoryId,
        batchId: lot.batchId,
        warehouseId: lot.warehouseId,
        weightGrams: args.grams,
        quantity: 1,
        title: args.title,
        brand: args.brand,
        size: args.size,
        condition: args.condition,
        photoKeys: args.photoKeys ?? [],
        costPaise: args.costPaise ?? 0,
        inspectionPassed: false,
      },
    });
    await movement(tx, unit, { type: "SORT_IN", deltaGrams: args.grams, deltaQuantity: 1, actorId: actor.id, reason: `From lot ${lot.code}` });
    await audit(tx, actor, "inventory.unit_create", "InventoryItem", unit.id, { after: { lotId: lot.id, grams: args.grams } });
    return unit;
  });
}

/** Item-level quality inspection (required before marketplace publishing). */
export async function inspectItem(actor: Actor, args: { itemId: string; result: "PASSED" | "FAILED" | "NEEDS_REPAIR"; notes?: string; photoKeys?: string[] }) {
  assertPermission(actor, "warehouse:sort");
  return transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: args.itemId } });
    if (!item) throw new AppError("NOT_FOUND", "Item not found.");
    const grade: SortGrade = args.result === "PASSED" ? item.grade : args.result === "NEEDS_REPAIR" ? "REPAIRABLE" : "STANDARD_REUSABLE";
    await tx.qualityInspection.create({ data: { itemId: item.id, batchId: item.batchId, inspectorId: actor.id, result: args.result, grade, notes: args.notes, photoKeys: args.photoKeys ?? [] } });
    const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { inspectionPassed: args.result === "PASSED", grade } });
    await audit(tx, actor, "inventory.inspect", "InventoryItem", item.id, { after: { result: args.result } });
    return updated;
  });
}

export async function transferItem(actor: Actor, args: { itemId: string; toWarehouseId: string; reason?: string }) {
  assertPermission(actor, "inventory:manage");
  return transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: args.itemId } });
    if (!item) throw new AppError("NOT_FOUND", "Item not found.");
    if (!["IN_STOCK", "LISTED"].includes(item.status)) throw new AppError("INVALID_STATE", "Only in-stock items can be transferred.");
    if (item.warehouseId === args.toWarehouseId) throw new AppError("VALIDATION", "Item is already at that warehouse.");
    const to = await tx.warehouseLocation.findFirst({ where: { id: args.toWarehouseId, active: true } });
    if (!to) throw new AppError("VALIDATION", "Destination warehouse is not active.");
    await tx.inventoryItem.update({ where: { id: item.id }, data: { warehouseId: to.id } });
    await movement(tx, item, { type: "TRANSFER", deltaGrams: 0, actorId: actor.id, fromWarehouseId: item.warehouseId, toWarehouseId: to.id, reason: args.reason });
    await audit(tx, actor, "inventory.transfer", "InventoryItem", item.id, { before: { warehouseId: item.warehouseId }, after: { warehouseId: to.id } });
  });
}

/** Adjustments require a second person's approval before stock changes. */
export async function requestAdjustment(actor: Actor, args: { itemId: string; deltaGrams: number; reason: string }) {
  assertPermission(actor, "inventory:manage");
  if (!args.deltaGrams) throw new AppError("VALIDATION", "Adjustment cannot be zero.");
  if (args.reason.trim().length < 5) throw new AppError("VALIDATION", "Give a reason for the adjustment.");
  const item = await db.inventoryItem.findUnique({ where: { id: args.itemId } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found.");
  if (item.weightGrams + args.deltaGrams < 0) throw new AppError("VALIDATION", "Adjustment would make stock negative.");
  const m = await db.inventoryMovement.create({
    data: { itemId: item.id, type: "ADJUSTMENT", status: "PENDING_APPROVAL", deltaGrams: args.deltaGrams, reason: args.reason, actorId: actor.id, referenceType: "ADJUSTMENT" },
  });
  await audit(db, actor, "inventory.adjust_request", "InventoryMovement", m.id, { after: args });
  return m;
}

export async function decideAdjustment(actor: Actor, movementId: string, approve: boolean) {
  assertPermission(actor, "inventory:approve");
  return transaction(async (tx) => {
    const m = await tx.inventoryMovement.findUnique({ where: { id: movementId } });
    if (!m || m.status !== "PENDING_APPROVAL") throw new AppError("INVALID_STATE", "Adjustment is not pending.");
    if (m.actorId === actor.id && actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", "Another manager must approve your adjustment.");
    if (!approve) {
      await tx.inventoryMovement.update({ where: { id: m.id }, data: { status: "REJECTED", approvedById: actor.id, approvedAt: new Date() } });
      await audit(tx, actor, "inventory.adjust_reject", "InventoryMovement", m.id);
      return;
    }
    const r = await tx.inventoryItem.updateMany({ where: { id: m.itemId, weightGrams: { gte: -m.deltaGrams } }, data: { weightGrams: { increment: m.deltaGrams } } });
    if (r.count !== 1) throw new AppError("CONFLICT", "Stock is now lower than the adjustment.");
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: m.itemId } });
    if (item.weightGrams === 0 && item.kind === "LOT") await tx.inventoryItem.update({ where: { id: item.id }, data: { status: "SCRAPPED" } });
    await tx.inventoryMovement.update({ where: { id: m.id }, data: { status: "POSTED", approvedById: actor.id, approvedAt: new Date() } });
    await audit(tx, actor, "inventory.adjust_approve", "InventoryMovement", m.id, { after: { deltaGrams: m.deltaGrams } });
  });
}

/** Deduct weight from a lot for an outbound sale/dispatch (B2B, recycling). */
export async function dispatchFromLot(tx: Tx, args: { itemId: string; grams: number; actorId: string; referenceType: string; referenceId: string }) {
  const r = await tx.inventoryItem.updateMany({ where: { id: args.itemId, weightGrams: { gte: args.grams }, status: { in: ["IN_STOCK", "LISTED", "RESERVED"] } }, data: { weightGrams: { decrement: args.grams } } });
  if (r.count !== 1) throw new AppError("CONFLICT", "Not enough stock in the lot to dispatch.");
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: args.itemId } });
  if (item.weightGrams === 0) await tx.inventoryItem.update({ where: { id: item.id }, data: { status: "DISPATCHED" } });
  await movement(tx, item, { type: "DISPATCH", deltaGrams: -args.grams, actorId: args.actorId, referenceType: args.referenceType, referenceId: args.referenceId, fromWarehouseId: item.warehouseId });
  return item;
}

/** End-to-end weight trail for a booking: collected → received → sorted → dispatched. */
export async function weightTrail(bookingId: string) {
  const batch = await db.collectionBatch.findUnique({ where: { bookingId }, include: { items: { include: { movements: true } } } });
  if (!batch) return null;
  const moves = batch.items.flatMap((i) => i.movements);
  const sum = (t: MovementType[]) => moves.filter((m) => t.includes(m.type) && m.status === "POSTED").reduce((s, m) => s + m.deltaGrams, 0);
  return { collectedGrams: batch.collectedGrams, receivedGrams: batch.receivedGrams, sortedGrams: batch.sortedGrams, dispatchedGrams: -sum(["DISPATCH", "SALE"]), lossGrams: -sum(["ADJUSTMENT"]) };
}
