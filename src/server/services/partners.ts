import { db, transaction } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { humanCode } from "../domain/codes";
import { AppError } from "../domain/errors";
import { cr, dr, postJournal } from "./ledger";
import { notify } from "./notifications";
import { dispatchFromLot } from "./warehouse";

// ───────────── Recycler partners ─────────────

export async function registerRecycler(actor: Actor, input: { name: string; licenseNumber?: string; pollutionCertNo?: string; city: string; materialsAccepted: string[] }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, include: { role: true, recyclerPartner: true, _count: { select: { bookings: true } } } });
  if (user.recyclerPartner) throw new AppError("CONFLICT", "Recycler profile already exists.");
  if (user.role.key !== "CUSTOMER" || user._count.bookings > 0) throw new AppError("INVALID_STATE", "Use a dedicated phone number for your recycler account.");
  const role = await db.role.findUniqueOrThrow({ where: { key: "RECYCLER_PARTNER" } });
  return transaction(async (tx) => {
    const p = await tx.recyclerPartner.create({ data: { ...input, userId: actor.id } });
    await tx.user.update({ where: { id: actor.id }, data: { roleId: role.id } });
    await audit(tx, actor, "recycler.register", "RecyclerPartner", p.id, { after: input });
    return p;
  });
}

export async function verifyRecycler(actor: Actor, partnerId: string, decision: "VERIFIED" | "REJECTED" | "SUSPENDED", ratePerKgPaise?: number) {
  assertPermission(actor, "business:verify");
  const p = await db.recyclerPartner.update({
    where: { id: partnerId },
    data: { verificationStatus: decision, verifiedAt: decision === "VERIFIED" ? new Date() : null, ...(ratePerKgPaise !== undefined ? { ratePerKgPaise } : {}) },
  });
  await audit(db, actor, `recycler.${decision.toLowerCase()}`, "RecyclerPartner", partnerId, { after: { decision, ratePerKgPaise } });
  await notify(p.userId, { title: "Recycler verification", body: `Your account is ${decision.toLowerCase()}.`, link: "/recycler" });
}

export async function createRecyclerDispatch(actor: Actor, input: { partnerId: string; itemIds: string[]; ratePerKgPaise: number; vehicleNumber?: string }) {
  assertPermission(actor, "recycling:manage");
  if (input.itemIds.length === 0) throw new AppError("VALIDATION", "Select at least one recyclable lot.");
  return transaction(async (tx) => {
    const partner = await tx.recyclerPartner.findUnique({ where: { id: input.partnerId } });
    if (!partner || partner.verificationStatus !== "VERIFIED") throw new AppError("VALIDATION", "Recycler is not verified.");
    const items = await tx.inventoryItem.findMany({ where: { id: { in: input.itemIds } } });
    if (items.length !== input.itemIds.length) throw new AppError("VALIDATION", "Unknown inventory item.");
    if (items.some((i) => !["RECYCLABLE", "UPCYCLING", "REJECTED"].includes(i.grade) || i.kind !== "LOT")) throw new AppError("VALIDATION", "Only recyclable / upcycling lots can go to recyclers.");
    const warehouses = new Set(items.map((i) => i.warehouseId));
    if (warehouses.size > 1) throw new AppError("VALIDATION", "Dispatch lots from one warehouse at a time.");
    const code = humanCode("RD");
    const d = await tx.recyclerDispatch.create({
      data: {
        code,
        partnerId: partner.id,
        warehouseId: items[0].warehouseId,
        itemIds: input.itemIds,
        dispatchedGrams: items.reduce((s, i) => s + i.weightGrams, 0),
        ratePerKgPaise: input.ratePerKgPaise,
        vehicleNumber: input.vehicleNumber,
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        createdById: actor.id,
      },
    });
    for (const i of items) {
      if (i.weightGrams > 0) await dispatchFromLot(tx, { itemId: i.id, grams: i.weightGrams, actorId: actor.id, referenceType: "RECYCLER_DISPATCH", referenceId: d.id });
      else await tx.inventoryItem.update({ where: { id: i.id }, data: { status: "DISPATCHED" } });
    }
    await audit(tx, actor, "recycling.dispatch", "RecyclerDispatch", d.id, { after: { dispatchedGrams: d.dispatchedGrams } });
    await notify(partner.userId, { title: "Material dispatched to you", body: `${code}: ${(d.dispatchedGrams / 1000).toFixed(1)} kg`, link: "/recycler" });
    return d;
  });
}

export async function confirmRecyclerReceipt(actor: Actor, dispatchId: string, receivedGrams: number) {
  assertPermission(actor, "recycling:partner");
  const d = await db.recyclerDispatch.findUnique({ where: { id: dispatchId }, include: { partner: true } });
  if (!d || d.partner.userId !== actor.id) throw new AppError("NOT_FOUND", "Dispatch not found.");
  if (d.status !== "DISPATCHED") throw new AppError("INVALID_STATE", "Dispatch already received.");
  if (receivedGrams <= 0 || receivedGrams > d.dispatchedGrams * 1.05) throw new AppError("VALIDATION", "Received weight looks wrong.");
  await db.recyclerDispatch.update({ where: { id: d.id }, data: { status: "DELIVERED", receivedGrams, deliveredAt: new Date(), settlementPaise: Math.round((receivedGrams * d.ratePerKgPaise) / 1000) } });
  await audit(db, actor, "recycling.received", "RecyclerDispatch", d.id, { after: { receivedGrams } });
}

export async function settleRecyclerDispatch(actor: Actor, dispatchId: string, settlementRef: string) {
  assertPermission(actor, "recycling:manage");
  await transaction(async (tx) => {
    const d = await tx.recyclerDispatch.findUnique({ where: { id: dispatchId } });
    if (!d || d.status !== "DELIVERED" || !d.settlementPaise) throw new AppError("INVALID_STATE", "Only delivered dispatches can be settled.");
    await tx.recyclerDispatch.update({ where: { id: d.id }, data: { status: "SETTLED", settledAt: new Date(), settlementRef } });
    await postJournal(tx, {
      key: `recycler:${d.id}:settle`,
      referenceType: "RECYCLER_DISPATCH",
      referenceId: d.id,
      description: `Recycler settlement ${d.code} (${settlementRef})`,
      legs: [dr("BANK", d.settlementPaise), cr("RECYCLING_REVENUE", d.settlementPaise)],
      actorId: actor.id,
    });
    await audit(tx, actor, "recycling.settle", "RecyclerDispatch", d.id, { after: { settlementRef } });
  });
}

// ───────────── Donations (kept separate from commercial sales) ─────────────

export async function handOverDonation(actor: Actor, donationId: string) {
  assertPermission(actor, "donation:manage");
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { partner: true } });
  if (!d || d.status !== "COLLECTED") throw new AppError("INVALID_STATE", "Only collected donations can be handed over.");
  const year = new Date().getFullYear();
  const seq = (await db.donation.count({ where: { receiptNumber: { not: null } } })) + 1;
  await db.donation.update({ where: { id: d.id }, data: { status: "HANDED_OVER", handedOverAt: new Date(), receiptNumber: `RW/DON/${year}/${String(seq).padStart(5, "0")}` } });
  await audit(db, actor, "donation.handover", "Donation", d.id);
  if (d.partner.userId) await notify(d.partner.userId, { title: "Donation handed over", body: `${d.code} is ready for your acknowledgement.`, link: "/partner" });
  await notify(d.donorId, { title: "Your donation reached the NGO", body: `${d.partner.name} has received your clothes. Your receipt is ready.`, link: `/app/bookings/${d.bookingId}` });
}

export async function acknowledgeDonation(actor: Actor, donationId: string, note: string) {
  assertPermission(actor, "donation:partner");
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { partner: true } });
  if (!d || d.partner.userId !== actor.id) throw new AppError("NOT_FOUND", "Donation not found.");
  if (d.status !== "HANDED_OVER") throw new AppError("INVALID_STATE", "Donation not yet handed over.");
  await db.donation.update({ where: { id: d.id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgement: note.slice(0, 500) } });
  await audit(db, actor, "donation.acknowledge", "Donation", d.id, { after: { note } });
  await notify(d.donorId, { title: "Thank you note from your NGO", body: note.slice(0, 140), link: `/app/bookings/${d.bookingId}` });
}

export async function upsertDonationPartner(actor: Actor, input: { id?: string; name: string; registrationNo?: string; has80G: boolean; city: string; focusAreas: string[]; description?: string; verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED"; active: boolean }) {
  assertPermission(actor, "donation:manage");
  const { id, ...data } = input;
  const p = id ? await db.donationPartner.update({ where: { id }, data }) : await db.donationPartner.create({ data });
  await audit(db, actor, id ? "donation.partner_update" : "donation.partner_create", "DonationPartner", p.id, { after: data });
  return p;
}
