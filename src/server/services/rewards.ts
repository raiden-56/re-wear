import type { RewardType } from "@prisma/client";
import { db, isUniqueViolation, type DbOrTx } from "../db";
import { getSetting } from "../settings";
import { notify } from "./notifications";

/** Reward points are loyalty points only — not money, not withdrawable. */
export async function awardPoints(client: DbOrTx, userId: string, type: RewardType, points: number, description: string, idempotencyKey: string) {
  if (points === 0) return false;
  try {
    await client.rewardTransaction.create({ data: { userId, type, points, description, idempotencyKey } });
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
  await client.customerProfile.updateMany({ where: { userId }, data: { rewardPoints: { increment: points } } });
  return true;
}

export async function onBookingCompleted(bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { weighings: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!booking) return;
  const cfg = await getSetting("rewards");
  const w = booking.weighings[0];
  const kg = w ? Math.floor((w.netGrams - w.rejectedGrams) / 1000) : 0;
  await awardPoints(db, booking.customerId, "MILESTONE", kg * cfg.pointsPerKg, `${kg} kg given a second life (${booking.code})`, `booking:${booking.id}:kg`);

  const referral = await db.referral.findUnique({ where: { refereeId: booking.customerId } });
  if (referral && referral.status === "PENDING") {
    const r = await db.referral.updateMany({ where: { id: referral.id, status: "PENDING" }, data: { status: "QUALIFIED", qualifiedAt: new Date() } });
    if (r.count === 1) {
      await awardPoints(db, referral.referrerId, "REFERRAL_REFERRER", cfg.referrerPoints, "Your friend completed their first pickup", `referral:${referral.id}:referrer`);
      await awardPoints(db, referral.refereeId, "REFERRAL_REFEREE", cfg.refereePoints, "Welcome bonus for joining with a referral", `referral:${referral.id}:referee`);
      await notify(referral.referrerId, { title: "Referral reward earned", body: `You earned ${cfg.referrerPoints} ReWear points.`, link: "/app/rewards" });
    }
  }
}
