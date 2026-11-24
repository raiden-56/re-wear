import { db, isUniqueViolation, transaction } from "../db";
import { audit, type Actor } from "../audit";
import { randomCode } from "../domain/codes";
import { AppError } from "../domain/errors";
import { findServiceArea } from "./serviceability";

async function uniqueReferralCode() {
  for (let i = 0; i < 6; i++) {
    const code = `RW${randomCode(6)}`;
    if (!(await db.customerProfile.findUnique({ where: { referralCode: code } }))) return code;
  }
  throw new AppError("CONFLICT", "Could not allocate referral code.");
}

/** Find or create the account for a verified phone number. New accounts are customers. */
export async function upsertUserByPhone(phone: string) {
  const existing = await db.user.findUnique({ where: { phone }, include: { role: true } });
  if (existing) {
    if (existing.status !== "ACTIVE" || existing.deletedAt) throw new AppError("FORBIDDEN", "This account is not active. Contact ReWear support.");
    if (!existing.phoneVerified) await db.user.update({ where: { id: existing.id }, data: { phoneVerified: true } });
    return { user: existing, isNew: false };
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  try {
    const user = await db.user.create({
      data: { phone, phoneVerified: true, roleId: role.id, customerProfile: { create: { referralCode: await uniqueReferralCode() } } },
      include: { role: true },
    });
    await audit(db, { id: user.id, role: "CUSTOMER" }, "user.signup", "User", user.id, { after: { method: "phone" } });
    return { user, isNew: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { user: await db.user.findUniqueOrThrow({ where: { phone }, include: { role: true } }), isNew: false };
    throw e;
  }
}

export async function upsertUserByGoogle(profile: { sub: string; email: string; name?: string; picture?: string; emailVerified: boolean }) {
  if (!profile.emailVerified) throw new AppError("FORBIDDEN", "Your Google email is not verified.");
  const bySub = await db.user.findUnique({ where: { googleSub: profile.sub }, include: { role: true } });
  if (bySub) return { user: bySub, isNew: false };
  const byEmail = await db.user.findUnique({ where: { email: profile.email }, include: { role: true } });
  if (byEmail) {
    const user = await db.user.update({ where: { id: byEmail.id }, data: { googleSub: profile.sub, avatarUrl: byEmail.avatarUrl ?? profile.picture }, include: { role: true } });
    return { user, isNew: false };
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  const user = await db.user.create({
    data: { email: profile.email, googleSub: profile.sub, name: profile.name, avatarUrl: profile.picture, roleId: role.id, customerProfile: { create: { referralCode: await uniqueReferralCode() } } },
    include: { role: true },
  });
  await audit(db, { id: user.id, role: "CUSTOMER" }, "user.signup", "User", user.id, { after: { method: "google" } });
  return { user, isNew: true };
}

export async function completeOnboarding(actor: Actor, input: { name: string; email?: string | null; referralCode?: string | null; marketingOptIn: boolean }) {
  await transaction(async (tx) => {
    try {
      await tx.user.update({ where: { id: actor.id }, data: { name: input.name.trim(), email: input.email?.trim().toLowerCase() || undefined } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError("CONFLICT", "That email is already used by another account.");
      throw e;
    }
    await tx.customerProfile.updateMany({ where: { userId: actor.id }, data: { marketingOptIn: input.marketingOptIn } });
    if (input.referralCode) {
      const ref = await tx.customerProfile.findUnique({ where: { referralCode: input.referralCode.trim().toUpperCase() } });
      if (!ref) throw new AppError("VALIDATION", "That referral code doesn't exist.");
      if (ref.userId === actor.id) throw new AppError("VALIDATION", "You can't refer yourself.");
      const already = await tx.referral.findUnique({ where: { refereeId: actor.id } });
      const hasBookings = await tx.booking.count({ where: { customerId: actor.id } });
      if (!already && hasBookings === 0) await tx.referral.create({ data: { referrerId: ref.userId, refereeId: actor.id } });
    }
    await audit(tx, actor, "user.onboard", "User", actor.id, { after: { name: input.name } });
  });
}

export async function updateProfile(actor: Actor, input: { name: string; email?: string | null; marketingOptIn: boolean; whatsappOptIn: boolean; showOnLeaderboard: boolean; preferredLanguage: string }) {
  await transaction(async (tx) => {
    try {
      await tx.user.update({ where: { id: actor.id }, data: { name: input.name.trim(), email: input.email?.trim().toLowerCase() || null } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError("CONFLICT", "That email is already used by another account.");
      throw e;
    }
    await tx.customerProfile.updateMany({
      where: { userId: actor.id },
      data: { marketingOptIn: input.marketingOptIn, whatsappOptIn: input.whatsappOptIn, showOnLeaderboard: input.showOnLeaderboard, preferredLanguage: input.preferredLanguage },
    });
    await audit(tx, actor, "user.profile_update", "User", actor.id);
  });
}

export type AddressInput = {
  id?: string;
  label: string;
  contactName: string;
  contactPhone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault: boolean;
};

export async function saveAddress(actor: Actor, input: AddressInput) {
  const area = await findServiceArea(input.pincode);
  return transaction(async (tx) => {
    if (input.isDefault) await tx.address.updateMany({ where: { userId: actor.id }, data: { isDefault: false } });
    const count = await tx.address.count({ where: { userId: actor.id, deletedAt: null } });
    const { id, ...data } = input;
    const payload = { ...data, serviceAreaId: area?.id ?? null, isDefault: input.isDefault || count === 0 };
    let addr;
    if (id) {
      const own = await tx.address.findFirst({ where: { id, userId: actor.id, deletedAt: null } });
      if (!own) throw new AppError("NOT_FOUND", "Address not found.");
      addr = await tx.address.update({ where: { id }, data: payload });
    } else {
      addr = await tx.address.create({ data: { ...payload, userId: actor.id } });
    }
    await audit(tx, actor, id ? "address.update" : "address.create", "Address", addr.id);
    return { address: addr, serviceable: !!area };
  });
}

export async function deleteAddress(actor: Actor, id: string) {
  const own = await db.address.findFirst({ where: { id, userId: actor.id, deletedAt: null } });
  if (!own) throw new AppError("NOT_FOUND", "Address not found.");
  const open = await db.booking.count({ where: { addressId: id, status: { in: ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] } } });
  if (open) throw new AppError("INVALID_STATE", "This address has an upcoming pickup.");
  await db.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  await audit(db, actor, "address.delete", "Address", id);
}

/** Privacy: export everything we hold about the user (DPDP-style data access). */
export async function exportMyData(actor: Actor) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    include: {
      customerProfile: true,
      addresses: { where: { deletedAt: null } },
      bookings: { include: { items: true, valuations: true, weighings: true } },
      payouts: true,
      upiAccounts: { where: { deletedAt: null }, select: { vpa: true, verified: true, isPrimary: true, createdAt: true } },
      rewardTxns: true,
      marketplaceOrders: { include: { items: true } },
    },
  });
  await audit(db, actor, "user.data_export", "User", actor.id);
  return user;
}

/** Privacy: deactivate and anonymise — financial records are retained as required by law. */
export async function deleteMyAccount(actor: Actor) {
  const open = await db.booking.count({ where: { customerId: actor.id, status: { in: ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED", "DISPUTED"] } } });
  const unpaid = await db.payout.count({ where: { customerId: actor.id, status: { notIn: ["SUCCESSFUL"] } } });
  if (open || unpaid) throw new AppError("INVALID_STATE", "Please wait until your open pickups and payouts are complete.");
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { status: "DEACTIVATED", deletedAt: new Date(), name: "Deleted user", email: null, phone: null, googleSub: null, avatarUrl: null } });
    await tx.address.updateMany({ where: { userId: actor.id }, data: { deletedAt: new Date() } });
    await tx.upiAccount.updateMany({ where: { userId: actor.id }, data: { deletedAt: new Date(), isPrimary: false } });
    await tx.session.updateMany({ where: { userId: actor.id }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "user.delete", "User", actor.id);
  });
}
