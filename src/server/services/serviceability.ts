import { db, type DbOrTx } from "../db";
import { AppError } from "../domain/errors";
import { addDays, dayOfWeek, dayToDate, istInstant, isValidDay, todayIST } from "@/lib/dates";
import { getSetting } from "../settings";

const ACTIVE_BOOKING = ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED", "COMPLETED", "DISPUTED"] as const;

export async function findServiceArea(pincode: string, client: DbOrTx = db) {
  if (!/^\d{6}$/.test(pincode)) throw new AppError("VALIDATION", "Enter a valid 6-digit pincode.");
  return client.serviceArea.findFirst({ where: { active: true, pincodes: { has: pincode } } });
}

export async function checkServiceability(pincode: string) {
  const area = await findServiceArea(pincode);
  return area
    ? { serviceable: true as const, area: { id: area.id, name: area.name, city: area.city, zone: area.zone, minimumKgPolicy: area.minimumKgPolicy, policyNote: area.policyNote } }
    : { serviceable: false as const };
}

/** Validate that a pickup day can be booked in an area (window, operating days, blackout). */
export async function assertBookableDay(serviceAreaId: string, day: string, client: DbOrTx = db) {
  if (!isValidDay(day)) throw new AppError("VALIDATION", "Choose a valid pickup date.");
  const { bookingWindowDays } = await getSetting("pickup", client);
  const today = todayIST();
  if (day < today || day > addDays(today, bookingWindowDays)) throw new AppError("VALIDATION", `Pickups can be booked up to ${bookingWindowDays} days ahead.`);
  const area = await client.serviceArea.findUnique({ where: { id: serviceAreaId } });
  if (!area || !area.active) throw new AppError("NOT_SERVICEABLE", "This area is not currently serviceable.");
  if (!area.operatingDays.includes(dayOfWeek(day))) throw new AppError("VALIDATION", "We don't collect in this area on that day.");
  const blackout = await client.slotBlackout.findFirst({ where: { date: dayToDate(day), OR: [{ serviceAreaId }, { serviceAreaId: null }] } });
  if (blackout) throw new AppError("VALIDATION", `Pickups are unavailable on this date: ${blackout.reason}`);
  return area;
}

/** Slots for a day with live remaining capacity. */
export async function availableSlots(serviceAreaId: string, day: string, client: DbOrTx = db) {
  try {
    await assertBookableDay(serviceAreaId, day, client);
  } catch {
    return [];
  }
  const { sameDayCutoffHours } = await getSetting("pickup", client);
  const slots = await client.pickupSlot.findMany({ where: { serviceAreaId, active: true }, orderBy: { startTime: "asc" } });
  const counts = await client.booking.groupBy({
    by: ["slotId"],
    where: { serviceAreaId, pickupDate: dayToDate(day), status: { in: [...ACTIVE_BOOKING] } },
    _count: { _all: true },
  });
  const used = new Map(counts.map((c) => [c.slotId, c._count._all]));
  const now = Date.now();
  return slots.map((s) => {
    const remaining = Math.max(0, s.capacity - (used.get(s.id) ?? 0));
    const tooLate = istInstant(day, s.startTime).getTime() - now < sameDayCutoffHours * 3600_000;
    return { id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime, remaining, available: remaining > 0 && !tooLate };
  });
}

export async function slotRemaining(slotId: string, day: string, client: DbOrTx) {
  const slot = await client.pickupSlot.findUnique({ where: { id: slotId } });
  if (!slot || !slot.active) throw new AppError("VALIDATION", "That time slot is no longer offered.");
  const used = await client.booking.count({ where: { slotId, pickupDate: dayToDate(day), status: { in: [...ACTIVE_BOOKING] } } });
  return { slot, remaining: slot.capacity - used };
}
