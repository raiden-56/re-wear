import type { LedgerAccount, Prisma, RoleKey } from "@prisma/client";
import { db, isUniqueViolation, transaction } from "../db";
import { audit, type Actor } from "../audit";
import { assertPermission } from "../auth/guard";
import { normalizePhone } from "../auth/otp";
import { humanCode, randomCode } from "../domain/codes";
import { AppError } from "../domain/errors";
import { dayToDate } from "@/lib/dates";
import { SETTING_DEFAULTS, type SettingKey } from "../settings";
import { cr, dr, postJournal } from "./ledger";

// ───────────── Service areas & free pickup slots ─────────────

export async function saveServiceArea(
  actor: Actor,
  input: { id?: string; name: string; city: string; state: string; zone: string; pincodes: string[]; active: boolean; operatingStart: string; operatingEnd: string; operatingDays: number[]; minimumKgPolicy: number; policyNote?: string | null; logisticsCostPerPickupPaise: number },
) {
  assertPermission(actor, "ops:manage");
  if (input.pincodes.some((p) => !/^\d{6}$/.test(p))) throw new AppError("VALIDATION", "Pincodes must be 6 digits.");
  if (input.minimumKgPolicy > 0 && !input.policyNote?.trim()) {
    throw new AppError("VALIDATION", "A minimum quantity is a published policy change — add the customer-facing policy note.");
  }
  const { id, ...data } = input;
  try {
    const area = id ? await db.serviceArea.update({ where: { id }, data }) : await db.serviceArea.create({ data });
    await audit(db, actor, id ? "ops.area_update" : "ops.area_create", "ServiceArea", area.id, { after: data });
    return area;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A zone with that name already exists in this city.");
    throw e;
  }
}

export async function saveSlot(actor: Actor, input: { id?: string; serviceAreaId: string; label: string; startTime: string; endTime: string; capacity: number; active: boolean }) {
  assertPermission(actor, "ops:manage");
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime) || input.endTime <= input.startTime) throw new AppError("VALIDATION", "Enter a valid time window.");
  if (input.capacity < 0 || input.capacity > 500) throw new AppError("VALIDATION", "Capacity must be 0–500.");
  const { id, ...data } = input;
  try {
    const slot = id ? await db.pickupSlot.update({ where: { id }, data }) : await db.pickupSlot.create({ data });
    await audit(db, actor, id ? "ops.slot_update" : "ops.slot_create", "PickupSlot", slot.id, { after: data });
    return slot;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A slot already starts at that time.");
    throw e;
  }
}

export async function addBlackout(actor: Actor, input: { serviceAreaId?: string | null; date: string; reason: string }) {
  assertPermission(actor, "ops:manage");
  const b = await db.slotBlackout.create({ data: { serviceAreaId: input.serviceAreaId || null, date: dayToDate(input.date), reason: input.reason } });
  await audit(db, actor, "ops.blackout", "SlotBlackout", b.id, { after: input });
  return b;
}

export async function removeBlackout(actor: Actor, id: string) {
  assertPermission(actor, "ops:manage");
  await db.slotBlackout.delete({ where: { id } });
  await audit(db, actor, "ops.blackout_remove", "SlotBlackout", id);
}

// ───────────── Staff accounts ─────────────

export async function createStaffUser(actor: Actor, input: { name: string; phone: string; email?: string | null; role: RoleKey; serviceAreaId?: string | null; vehicleNumber?: string | null; dailyCapacity?: number }) {
  const elevated = ["ADMIN", "SUPER_ADMIN"].includes(input.role);
  assertPermission(actor, elevated ? "users:manage" : "ops:manage");
  if (["CUSTOMER", "B2B_BUYER", "RECYCLER_PARTNER"].includes(input.role)) throw new AppError("VALIDATION", "Customers and partners register themselves.");
  const phone = normalizePhone(input.phone);
  const role = await db.role.findUniqueOrThrow({ where: { key: input.role } });
  try {
    return await transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: input.name, phone, email: input.email || null, roleId: role.id, phoneVerified: false } });
      if (input.role === "COLLECTOR") {
        await tx.collectorProfile.create({
          data: { userId: user.id, employeeCode: `RWC-${randomCode(5)}`, serviceAreaId: input.serviceAreaId || null, vehicleNumber: input.vehicleNumber, dailyCapacity: input.dailyCapacity ?? 12 },
        });
      }
      await audit(tx, actor, "users.create_staff", "User", user.id, { after: { role: input.role, phone } });
      return user;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "An account with that phone or email already exists.");
    throw e;
  }
}

export async function updateCollector(actor: Actor, id: string, input: { serviceAreaId: string | null; dailyCapacity: number; active: boolean; vehicleNumber?: string | null }) {
  assertPermission(actor, "ops:manage");
  const c = await db.collectorProfile.update({ where: { id }, data: input });
  await audit(db, actor, "ops.collector_update", "CollectorProfile", id, { after: input });
  return c;
}

export async function changeRole(actor: Actor, userId: string, role: RoleKey) {
  assertPermission(actor, "users:manage");
  if (userId === actor.id) throw new AppError("VALIDATION", "You cannot change your own role.");
  const r = await db.role.findUniqueOrThrow({ where: { key: role } });
  const before = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  await db.user.update({ where: { id: userId }, data: { roleId: r.id } });
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(db, actor, "users.change_role", "User", userId, { before: { role: before.role.key }, after: { role } });
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  assertPermission(actor, "customers:manage");
  if (userId === actor.id) throw new AppError("VALIDATION", "You cannot suspend yourself.");
  const target = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  if (["ADMIN", "SUPER_ADMIN"].includes(target.role.key) && actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", "Only a super admin can suspend administrators.");
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "SUSPENDED") await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(db, actor, `users.${status.toLowerCase()}`, "User", userId, { before: { status: target.status }, after: { status, reason } });
}

// ───────────── Catalogue, warehouses, settings ─────────────

export async function saveCategory(actor: Actor, input: { id?: string; slug: string; name: string; description?: string | null; group: string; accepted: boolean; active: boolean; sortOrder: number; imageUrl?: string | null }) {
  assertPermission(actor, "settings:manage");
  const { id, ...data } = input;
  try {
    const c = id ? await db.clothingCategory.update({ where: { id }, data }) : await db.clothingCategory.create({ data });
    await audit(db, actor, id ? "settings.category_update" : "settings.category_create", "ClothingCategory", c.id, { after: data });
    return c;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A category with that slug exists.");
    throw e;
  }
}

export async function saveWarehouse(actor: Actor, input: { id?: string; code: string; name: string; city: string; address?: string | null; serviceAreaId?: string | null; active: boolean }) {
  assertPermission(actor, "ops:manage");
  const { id, ...data } = input;
  const w = id ? await db.warehouseLocation.update({ where: { id }, data }) : await db.warehouseLocation.create({ data });
  await audit(db, actor, id ? "ops.warehouse_update" : "ops.warehouse_create", "WarehouseLocation", w.id, { after: data });
  return w;
}

export async function updateSetting(actor: Actor, key: SettingKey, value: Record<string, unknown>) {
  assertPermission(actor, "settings:manage");
  if (!(key in SETTING_DEFAULTS)) throw new AppError("VALIDATION", "Unknown setting.");
  if ("pickupFeePaise" in value || JSON.stringify(value).toLowerCase().includes("pickupfee")) {
    throw new AppError("VALIDATION", "Free pickup is permanent — a pickup fee cannot be configured.");
  }
  const before = await db.appSetting.findUnique({ where: { key } });
  await db.appSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue, updatedBy: actor.id }, update: { value: value as Prisma.InputJsonValue, updatedBy: actor.id } });
  await audit(db, actor, "settings.update", "AppSetting", key, { before: before?.value, after: value });
}

export async function saveTemplate(actor: Actor, input: { id: string; subject?: string | null; body: string; active: boolean }) {
  assertPermission(actor, "settings:manage");
  await db.notificationTemplate.update({ where: { id: input.id }, data: { subject: input.subject, body: input.body, active: input.active } });
  await audit(db, actor, "settings.template_update", "NotificationTemplate", input.id);
}

// ───────────── Internal costs (never charged to customers) ─────────────

const COST_ACCOUNTS: LedgerAccount[] = ["LOGISTICS_COST", "SORTING_COST", "PROCESSING_COST"];

export async function recordOperatingCost(actor: Actor, input: { account: LedgerAccount; amountPaise: number; costDate: string; city?: string | null; description: string }) {
  assertPermission(actor, "finance:manage");
  if (!COST_ACCOUNTS.includes(input.account)) throw new AppError("VALIDATION", "Choose a cost account.");
  if (input.amountPaise <= 0) throw new AppError("VALIDATION", "Amount must be positive.");
  return transaction(async (tx) => {
    const c = await tx.operatingCost.create({ data: { ...input, costDate: dayToDate(input.costDate), createdById: actor.id } });
    await postJournal(tx, {
      key: `cost:${c.id}`,
      referenceType: "COST",
      referenceId: c.id,
      description: input.description,
      legs: [dr(input.account, input.amountPaise), cr("BANK", input.amountPaise)],
      actorId: actor.id,
    });
    await audit(tx, actor, "finance.cost", "OperatingCost", c.id, { after: input });
    return c;
  });
}

// ───────────── Support ─────────────

export async function createTicket(actor: Actor, input: { subject: string; body: string; type: "GENERAL" | "PAYMENT" | "PICKUP" | "ORDER"; bookingId?: string | null }) {
  if (input.bookingId) {
    const b = await db.booking.findFirst({ where: { id: input.bookingId, customerId: actor.id } });
    if (!b) throw new AppError("NOT_FOUND", "Booking not found.");
  }
  const t = await db.supportTicket.create({
    data: { code: humanCode("TK"), userId: actor.id, subject: input.subject, type: input.type, bookingId: input.bookingId || null, messages: { create: { authorId: actor.id, body: input.body } } },
  });
  await audit(db, actor, "support.create", "SupportTicket", t.id);
  return t;
}

export async function replyTicket(actor: Actor, ticketId: string, body: string, internal = false) {
  const t = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t) throw new AppError("NOT_FOUND", "Ticket not found.");
  const staff = t.userId !== actor.id;
  if (staff) assertPermission(actor, "support:manage");
  await db.supportMessage.create({ data: { ticketId, authorId: actor.id, body, internal: staff && internal } });
  await db.supportTicket.update({ where: { id: ticketId }, data: { status: staff ? "IN_PROGRESS" : t.status === "RESOLVED" ? "OPEN" : t.status } });
}

export async function setTicketStatus(actor: Actor, ticketId: string, status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED", resolution?: string) {
  assertPermission(actor, "support:manage");
  await db.supportTicket.update({ where: { id: ticketId }, data: { status, resolution, assigneeId: actor.id } });
  await audit(db, actor, "support.status", "SupportTicket", ticketId, { after: { status, resolution } });
}
