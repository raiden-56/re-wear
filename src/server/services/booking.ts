import type { Prisma, SellChannel } from "@prisma/client";
import { db, isUniqueViolation, transaction } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission, can } from "../auth/guard";
import { env } from "../env";
import { hmacSha256, humanCode, sha256 } from "../domain/codes";
import { AppError } from "../domain/errors";
import { assertFreePickup, checkMinimumQuantity, PICKUP_FEE_PAISE } from "../domain/pickup-policy";
import { BOOKING_MUTABLE, type BookingState } from "../domain/state";
import { dayToDate } from "@/lib/dates";
import { autoAssign, releaseAssignment } from "./assignment";
import { notify } from "./notifications";
import { quote } from "./pricing";
import { assertBookableDay, findServiceArea, slotRemaining } from "./serviceability";

export type CreateBookingInput = {
  channel: SellChannel;
  items: { categoryId: string; grams: number }[];
  bagCount: number;
  instructions?: string | null;
  photoKeys?: string[];
  addressId: string;
  pickupDate: string; // YYYY-MM-DD (IST)
  slotId: string;
  donationPartnerId?: string | null;
  pickupFeePaise?: number; // accepted only to reject anything but 0
};

/** 4-digit doorstep verification code, derived (never stored in clear). */
export function pickupCode(bookingCode: string) {
  const h = hmacSha256(env().AUTH_SECRET, `pickup:${bookingCode}`);
  return String(parseInt(h.slice(0, 8), 16) % 10000).padStart(4, "0");
}

export async function createBooking(actor: Actor, input: CreateBookingInput) {
  assertPermission(actor, "booking:create");
  assertFreePickup(input);
  if (input.items.length === 0) throw new AppError("VALIDATION", "Select at least one clothing category.");
  if (input.items.some((i) => !Number.isInteger(i.grams) || i.grams <= 0)) throw new AppError("VALIDATION", "Estimated weight must be greater than zero.");
  const totalGrams = input.items.reduce((s, i) => s + i.grams, 0);
  if (totalGrams > 500_000) throw new AppError("VALIDATION", "For more than 500 kg please request a bulk / corporate collection.");
  if (input.channel === "DONATION" && !input.donationPartnerId) throw new AppError("VALIDATION", "Choose an NGO partner for your donation.");

  const booking = await transaction(async (tx) => {
    const address = await tx.address.findFirst({ where: { id: input.addressId, userId: actor.id, deletedAt: null } });
    if (!address) throw new AppError("VALIDATION", "Choose one of your saved addresses.");
    const area = address.serviceAreaId
      ? await tx.serviceArea.findFirst({ where: { id: address.serviceAreaId, active: true } })
      : await findServiceArea(address.pincode, tx);
    if (!area) throw new AppError("NOT_SERVICEABLE", "Sorry — we don't collect from this pincode yet.");
    checkMinimumQuantity(totalGrams, area.minimumKgPolicy);
    await assertBookableDay(area.id, input.pickupDate, tx);

    // Lock the slot row so concurrent bookings cannot exceed capacity.
    await tx.$queryRaw`SELECT id FROM "PickupSlot" WHERE id = ${input.slotId} FOR UPDATE`;
    const { slot, remaining } = await slotRemaining(input.slotId, input.pickupDate, tx);
    if (slot.serviceAreaId !== area.id) throw new AppError("VALIDATION", "That slot belongs to a different area.");
    if (remaining <= 0) throw new AppError("CONFLICT", "That slot just filled up. Please pick another time.");

    if (input.donationPartnerId) {
      const partner = await tx.donationPartner.findFirst({ where: { id: input.donationPartnerId, active: true, verificationStatus: "VERIFIED" } });
      if (!partner) throw new AppError("VALIDATION", "That NGO partner is not available.");
    }

    const priced = await quote({ channel: input.channel, serviceAreaId: area.id, city: area.city, items: input.items }, tx);
    const snapshot = {
      pricedAt: priced.pricedAt,
      channel: input.channel,
      serviceAreaId: area.id,
      city: area.city,
      pickupFeePaise: PICKUP_FEE_PAISE,
      rates: priced.lines.map((l) => ({ categoryId: l.categoryId, name: l.name, ratePaisePerKg: l.ratePaisePerKg, pricingRuleId: l.pricingRuleId })),
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = humanCode("RW");
      try {
        const created = await tx.booking.create({
          data: {
            code,
            customerId: actor.id,
            channel: input.channel,
            addressId: address.id,
            serviceAreaId: area.id,
            slotId: slot.id,
            pickupDate: dayToDate(input.pickupDate),
            estimatedGrams: totalGrams,
            bagCount: input.bagCount,
            instructions: input.instructions?.slice(0, 500) || null,
            photoKeys: input.photoKeys ?? [],
            pickupFeePaise: PICKUP_FEE_PAISE,
            estimatedPaise: priced.totalPaise,
            pricingSnapshot: snapshot as Prisma.InputJsonValue,
            pickupOtpHash: sha256(pickupCode(code)),
            donationPartnerId: input.donationPartnerId ?? null,
            items: {
              create: priced.lines.map((l) => ({
                categoryId: l.categoryId,
                estimatedGrams: l.grams,
                ratePaisePerKg: l.ratePaisePerKg,
                pricingRuleId: l.pricingRuleId,
                estimatedPaise: l.subtotalPaise,
              })),
            },
            events: { create: { type: "CREATED", actorId: actor.id, note: `Free pickup booked for ${input.pickupDate} ${slot.label}` } },
          },
        });
        if (input.channel === "DONATION" && input.donationPartnerId) {
          await tx.donation.create({ data: { code: humanCode("DN"), bookingId: created.id, donorId: actor.id, partnerId: input.donationPartnerId } });
        }
        await audit(tx, actor, "booking.create", "Booking", created.id, { after: { code, channel: input.channel, totalGrams, estimatedPaise: priced.totalPaise } });
        return created;
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 4) continue;
        throw e;
      }
    }
    throw new AppError("CONFLICT", "Could not allocate a booking ID, please retry.");
  });

  await autoAssign(booking.id).catch((e) => console.error("auto-assign failed", e));
  await notify(actor.id, {
    title: "Free pickup confirmed",
    body: `Booking ${booking.code} on ${input.pickupDate}. Your doorstep code is ${pickupCode(booking.code)}.`,
    link: `/app/bookings/${booking.id}`,
    channels: ["IN_APP", "SMS", "WHATSAPP"],
  });
  return booking;
}

async function loadForChange(actor: Actor, bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  const isOwner = booking.customerId === actor.id;
  if (!isOwner && !can(actor, "booking:manage")) throw new AppError("FORBIDDEN", "You cannot change this booking.");
  return { booking, isOwner };
}

export async function rescheduleBooking(actor: Actor, bookingId: string, pickupDate: string, slotId: string) {
  const { booking } = await loadForChange(actor, bookingId);
  if (!BOOKING_MUTABLE.includes(booking.status as BookingState)) throw new AppError("INVALID_STATE", "This pickup can no longer be rescheduled.");
  await transaction(async (tx) => {
    await assertBookableDay(booking.serviceAreaId, pickupDate, tx);
    await tx.$queryRaw`SELECT id FROM "PickupSlot" WHERE id = ${slotId} FOR UPDATE`;
    const { slot, remaining } = await slotRemaining(slotId, pickupDate, tx);
    if (slot.serviceAreaId !== booking.serviceAreaId) throw new AppError("VALIDATION", "That slot belongs to a different area.");
    const sameSlot = slot.id === booking.slotId && dayToDate(pickupDate).getTime() === booking.pickupDate.getTime();
    if (!sameSlot && remaining <= 0) throw new AppError("CONFLICT", "That slot is full. Please pick another time.");
    await releaseAssignment(tx, bookingId);
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { pickupDate: dayToDate(pickupDate), slotId, status: "SCHEDULED" } });
    await tx.pickupEvent.create({ data: { bookingId, type: "RESCHEDULED", actorId: actor.id, note: `${pickupDate} ${slot.label}` } });
    await audit(tx, actor, "booking.reschedule", "Booking", bookingId, { before: { date: booking.pickupDate, slotId: booking.slotId }, after: { date: updated.pickupDate, slotId } });
  });
  await autoAssign(bookingId).catch(() => null);
}

export async function cancelBooking(actor: Actor, bookingId: string, reason: string) {
  const { booking, isOwner } = await loadForChange(actor, bookingId);
  const allowed: BookingState[] = isOwner && !can(actor, "booking:manage") ? BOOKING_MUTABLE : [...BOOKING_MUTABLE, "EN_ROUTE"];
  if (!allowed.includes(booking.status as BookingState)) throw new AppError("INVALID_STATE", "This pickup can no longer be cancelled.");
  await transaction(async (tx) => {
    const res = await tx.booking.updateMany({ where: { id: bookingId, status: booking.status }, data: { status: "CANCELLED", cancelReason: reason.slice(0, 300) } });
    if (res.count !== 1) throw new AppError("CONFLICT", "The booking changed — please refresh.");
    await releaseAssignment(tx, bookingId);
    await tx.donation.updateMany({ where: { bookingId }, data: { status: "CANCELLED" } });
    await tx.pickupEvent.create({ data: { bookingId, type: "CANCELLED", actorId: actor.id, note: reason } });
    await audit(tx, actor, "booking.cancel", "Booking", bookingId, { before: { status: booking.status }, after: { status: "CANCELLED", reason } });
  });
  if (!isOwner) await notify(booking.customerId, { title: "Pickup cancelled", body: `Booking ${booking.code} was cancelled: ${reason}`, link: `/app/bookings/${booking.id}` });
}

export async function markBookingFailed(actor: Actor, bookingId: string, reason: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { assignments: { where: { active: true }, include: { collector: true } } } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  const isCollector = booking.assignments[0]?.collector.userId === actor.id;
  if (!isCollector && !can(actor, "booking:manage")) throw new AppError("FORBIDDEN", "You cannot fail this pickup.");
  if (!["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"].includes(booking.status)) throw new AppError("INVALID_STATE", "This pickup cannot be marked failed now.");
  await transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "FAILED", failureReason: reason } });
    await releaseAssignment(tx, bookingId);
    await tx.pickupEvent.create({ data: { bookingId, type: "FAILED", actorId: actor.id, note: reason } });
    await audit(tx, actor, "booking.fail", "Booking", bookingId, { before: { status: booking.status }, after: { status: "FAILED", reason } });
  });
  await notify(booking.customerId, {
    title: "We missed your pickup",
    body: `Booking ${booking.code}: ${reason}. You can reschedule it for free from the app.`,
    link: `/app/bookings/${booking.id}`,
    channels: ["IN_APP", "SMS"],
  });
}

/** Admin: bring a failed pickup back to scheduled (free, new date). */
export async function reopenFailedBooking(actor: Actor, bookingId: string, pickupDate: string, slotId: string) {
  assertPermission(actor, "booking:manage");
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "FAILED") throw new AppError("INVALID_STATE", "Only failed pickups can be reopened.");
  await db.booking.update({ where: { id: bookingId }, data: { status: "SCHEDULED", failureReason: null } });
  await rescheduleBooking(actor, bookingId, pickupDate, slotId);
}
