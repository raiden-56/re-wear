import type { Prisma, RoleKey } from "@prisma/client";
import { db } from "@/server/db";
import { ROLE_PERMISSIONS, PERMISSIONS } from "@/server/auth/permissions";
import type { Actor } from "@/server/audit";
import { addDays, todayIST } from "@/lib/dates";

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let seq = 0;
const phone = () => `+9199${String(10000000 + ++seq).padStart(8, "0")}`;

/** Builds a minimal, consistent world: roles, 2 categories, 1 area with slots, staff and a customer. */
export async function buildWorld(opts: { slotCapacity?: number; collectors?: number; collectorCapacity?: number } = {}) {
  await resetDb();
  const perms = await Promise.all(Object.keys(PERMISSIONS).map((key) => db.permission.create({ data: { key } })));
  const roles = {} as Record<RoleKey, string>;
  for (const key of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    const r = await db.role.create({ data: { key, name: key, permissions: { create: ROLE_PERMISSIONS[key].map((p) => ({ permissionId: perms.find((x) => x.key === p)!.id })) } } });
    roles[key] = r.id;
  }
  const jeans = await db.clothingCategory.create({ data: { slug: "jeans", name: "Jeans" } });
  const tees = await db.clothingCategory.create({ data: { slug: "t-shirts", name: "T-shirts" } });
  const past = new Date(Date.now() - 30 * 86400_000);
  for (const [c, p] of [[jeans, 2000], [tees, 1200]] as const) {
    await db.pricingRule.create({ data: { categoryId: c.id, channel: "KG_BUYBACK", pricePerKgPaise: p, effectiveFrom: past, approvalStatus: "APPROVED" } });
  }
  const area = await db.serviceArea.create({
    data: { name: "Test Zone", city: "Bengaluru", state: "Karnataka", zone: "Test", pincodes: ["560034"], operatingDays: [0, 1, 2, 3, 4, 5, 6], slots: { create: [{ label: "9–11", startTime: "09:00", endTime: "11:00", capacity: opts.slotCapacity ?? 5 }] } },
    include: { slots: true },
  });
  const wh = await db.warehouseLocation.create({ data: { code: "T-HUB", name: "Test Hub", city: "Bengaluru", serviceAreaId: area.id } });
  const wh2 = await db.warehouseLocation.create({ data: { code: "T-HUB-2", name: "Overflow", city: "Bengaluru" } });

  const user = async (role: RoleKey, name: string) => db.user.create({ data: { phone: phone(), name, roleId: roles[role], phoneVerified: true } });
  const admin = await user("ADMIN", "Admin One");
  const admin2 = await user("ADMIN", "Admin Two");
  const superAdmin = await user("SUPER_ADMIN", "Super");
  const wm = await user("WAREHOUSE_MANAGER", "WM One");
  const wm2 = await user("WAREHOUSE_MANAGER", "WM Two");
  const collectors: Prisma.CollectorProfileGetPayload<{ include: { user: true } }>[] = [];
  for (let i = 0; i < (opts.collectors ?? 1); i++) {
    const u = await user("COLLECTOR", `Collector ${i + 1}`);
    collectors.push(await db.collectorProfile.create({ data: { userId: u.id, employeeCode: `C${seq}${i}`, serviceAreaId: area.id, dailyCapacity: opts.collectorCapacity ?? 10 }, include: { user: true } }));
  }
  const customer = await db.user.create({ data: { phone: phone(), name: "Test Customer", roleId: roles.CUSTOMER, phoneVerified: true, customerProfile: { create: { referralCode: `RWT${seq}` } } } });
  const address = await db.address.create({ data: { userId: customer.id, contactName: "Test Customer", contactPhone: customer.phone!, line1: "1 Test Street", city: "Bengaluru", state: "Karnataka", pincode: "560034", serviceAreaId: area.id, isDefault: true } });
  const badAddress = await db.address.create({ data: { userId: customer.id, contactName: "Test Customer", contactPhone: customer.phone!, line1: "Far away", city: "Mumbai", state: "Maharashtra", pincode: "400001" } });

  const actor = (u: { id: string }, role: string): Actor => ({ id: u.id, role });
  return {
    roles,
    jeans,
    tees,
    area,
    slot: area.slots[0],
    wh,
    wh2,
    customer,
    address,
    badAddress,
    collectors,
    day: addDays(todayIST(), 1),
    as: {
      admin: actor(admin, "ADMIN"),
      admin2: actor(admin2, "ADMIN"),
      superAdmin: actor(superAdmin, "SUPER_ADMIN"),
      wm: actor(wm, "WAREHOUSE_MANAGER"),
      wm2: actor(wm2, "WAREHOUSE_MANAGER"),
      customer: actor(customer, "CUSTOMER"),
      collector: (i = 0) => actor(collectors[i].user, "COLLECTOR"),
    },
  };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;
