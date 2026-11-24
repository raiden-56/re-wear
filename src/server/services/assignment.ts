import { db, transaction, type Tx } from "../db";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { AppError } from "../domain/errors";
import { assertTransition, BOOKING_TRANSITIONS, type BookingState } from "../domain/state";
import { notify } from "./notifications";

const LIVE = ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED"] as const;

/** Workload of each candidate collector for a pickup date. */
export async function collectorLoads(tx: Tx, serviceAreaId: string, pickupDate: Date) {
  const collectors = await tx.collectorProfile.findMany({
    where: { serviceAreaId, active: true, user: { status: "ACTIVE" } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const loads = await Promise.all(
    collectors.map((c) =>
      tx.pickupAssignment.count({ where: { collectorId: c.id, active: true, booking: { pickupDate, status: { in: [...LIVE] } } } }),
    ),
  );
  return collectors.map((c, i) => ({ collector: c, load: loads[i], free: c.dailyCapacity - loads[i] }));
}

/**
 * Pure selection policy: least-loaded collector with spare capacity,
 * ties broken by list order (stable, oldest profile first).
 */
export function pickCollector<T extends { load: number; free: number }>(candidates: T[]): T | null {
  const eligible = candidates.filter((c) => c.free > 0);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) => (c.load < best.load ? c : best));
}

async function setAssignment(tx: Tx, bookingId: string, collectorId: string, actor: Actor) {
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertTransition(BOOKING_TRANSITIONS, booking.status as BookingState, "ASSIGNED", "booking");
  const prev = await tx.pickupAssignment.findFirst({ where: { bookingId, active: true } });
  if (prev?.collectorId === collectorId) return prev;
  if (prev) await tx.pickupAssignment.update({ where: { id: prev.id }, data: { active: false, releasedAt: new Date() } });
  const a = await tx.pickupAssignment.create({ data: { bookingId, collectorId, assignedById: actor.id === "system" ? null : actor.id } });
  await tx.booking.update({ where: { id: bookingId }, data: { status: "ASSIGNED" } });
  await tx.pickupEvent.create({ data: { bookingId, type: prev ? "REASSIGNED" : "ASSIGNED", actorId: actor.id === "system" ? null : actor.id, meta: { collectorId } } });
  await audit(tx, actor, prev ? "booking.reassign" : "booking.assign", "Booking", bookingId, { before: prev ? { collectorId: prev.collectorId } : null, after: { collectorId } });
  return a;
}

/** Automatic assignment right after booking (or reschedule). Returns null if nobody is free. */
export async function autoAssign(bookingId: string) {
  const result = await transaction(async (tx) => {
    // Serialise assignment per service area/day so two bookings can't over-fill one collector.
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.status !== "SCHEDULED") return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assign:${booking.serviceAreaId}:${booking.pickupDate.toISOString()}`}))`;
    const choice = pickCollector(await collectorLoads(tx, booking.serviceAreaId, booking.pickupDate));
    if (!choice) return null;
    await setAssignment(tx, bookingId, choice.collector.id, SYSTEM_ACTOR);
    return choice.collector;
  });
  if (result) {
    const b = await db.booking.findUnique({ where: { id: bookingId } });
    if (b) await notify(b.customerId, { title: "Collector assigned", body: `${result.user.name ?? "A ReWear collector"} will pick up booking ${b.code}.`, link: `/app/bookings/${b.id}` });
  }
  return result;
}

/** Manual (re)assignment from the admin console. */
export async function assignCollector(actor: Actor, bookingId: string, collectorId: string) {
  assertPermission(actor, "booking:assign");
  const collector = await db.collectorProfile.findUnique({ where: { id: collectorId }, include: { user: true } });
  if (!collector || !collector.active) throw new AppError("VALIDATION", "Collector is not active.");
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  if (collector.serviceAreaId !== booking.serviceAreaId) throw new AppError("VALIDATION", "Collector does not cover this service area.");
  await transaction((tx) => setAssignment(tx, bookingId, collectorId, actor));
  await notify(booking.customerId, { title: "Collector assigned", body: `${collector.user.name} will pick up booking ${booking.code}.`, link: `/app/bookings/${booking.id}` });
  await notify(collector.userId, { title: "New pickup assigned", body: `Booking ${booking.code}`, link: `/collector/pickups/${booking.id}` });
}

export async function releaseAssignment(tx: Tx, bookingId: string) {
  await tx.pickupAssignment.updateMany({ where: { bookingId, active: true }, data: { active: false, releasedAt: new Date() } });
}
