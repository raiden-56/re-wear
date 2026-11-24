/* eslint-disable no-console */
/**
 * ReWear seed — realistic, internally-consistent demo data.
 *
 * Demo sign-in (development only): every demo phone uses OTP 123456.
 * Running the seed WIPES the target database. It refuses to run in production.
 */
import "dotenv/config";
import { PrismaClient, type ClothingCondition, type Prisma, type RoleKey, type SortGrade } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/server/auth/permissions";
import { pickupCode } from "../src/server/services/booking";
import { humanCode, randomCode, sha256 } from "../src/server/domain/codes";
import { categoryImages, productPhotos } from "../src/lib/images";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  throw new Error("Refusing to seed a production database.");
}

const db = new PrismaClient();

// Deterministic PRNG so every seed produces the same story.
let s = 20261124;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

const DAY = 86_400_000;
const now = new Date();
const istDay = (offsetDays: number) => new Date(new Date(now.getTime() + 330 * 60_000 + offsetDays * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z");
const at = (day: Date, hour: number, min = 0) => new Date(day.getTime() + (hour * 60 + min - 330) * 60_000);

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const CATEGORIES = [
  { slug: "mens-wear", name: "Men's wear", group: "APPAREL", description: "Shirts, trousers, kurtas and everyday menswear.", kg: 14, premium: 38, recycle: 6 },
  { slug: "womens-wear", name: "Women's wear", group: "APPAREL", description: "Tops, kurtis, skirts and everyday womenswear.", kg: 14, premium: 40, recycle: 6 },
  { slug: "kidswear", name: "Kidswear", group: "APPAREL", description: "Clothing for children up to 14 years.", kg: 12, premium: 30, recycle: 5 },
  { slug: "sarees", name: "Sarees", group: "ETHNIC", description: "Cotton, silk and synthetic sarees.", kg: 18, premium: 60, recycle: 7 },
  { slug: "ethnic-wear", name: "Ethnic wear", group: "ETHNIC", description: "Salwar suits, lehengas, sherwanis, dupattas.", kg: 16, premium: 55, recycle: 6 },
  { slug: "jeans", name: "Jeans", group: "DENIM", description: "Denim jeans and denim skirts.", kg: 20, premium: 45, recycle: 9 },
  { slug: "trousers", name: "Trousers", group: "APPAREL", description: "Chinos, formal trousers, joggers.", kg: 15, premium: 35, recycle: 6 },
  { slug: "shirts", name: "Shirts", group: "APPAREL", description: "Formal and casual shirts.", kg: 16, premium: 36, recycle: 6 },
  { slug: "t-shirts", name: "T-shirts", group: "APPAREL", description: "Cotton tees, polos, sports tees.", kg: 12, premium: 28, recycle: 7 },
  { slug: "dresses", name: "Dresses", group: "APPAREL", description: "Day dresses, maxis, gowns.", kg: 15, premium: 45, recycle: 6 },
  { slug: "jackets", name: "Jackets", group: "OUTERWEAR", description: "Denim, leather, bomber and winter jackets.", kg: 22, premium: 70, recycle: 8 },
  { slug: "sweaters", name: "Sweaters", group: "OUTERWEAR", description: "Sweaters, cardigans and hoodies.", kg: 18, premium: 42, recycle: 8 },
  { slug: "other-textiles", name: "Other approved textiles", group: "HOME", description: "Bedsheets, curtains, towels and cotton fabric.", kg: 6, premium: 0, recycle: 5 },
];

const AREAS = [
  { name: "Bengaluru South-East", city: "Bengaluru", state: "Karnataka", zone: "South-East", pincodes: ["560034", "560102", "560095", "560068", "560076"], wh: "BLR-HUB-01" },
  { name: "Bengaluru East", city: "Bengaluru", state: "Karnataka", zone: "East", pincodes: ["560066", "560037", "560048", "560038", "560008"], wh: "BLR-HUB-01" },
  { name: "Pune West", city: "Pune", state: "Maharashtra", zone: "West", pincodes: ["411038", "411004", "411052", "411045"], wh: "PUN-HUB-01" },
  { name: "Hyderabad West", city: "Hyderabad", state: "Telangana", zone: "West", pincodes: ["500032", "500081", "500084", "500019"], wh: "HYD-HUB-01" },
];

const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Isha", "Arjun", "Sneha", "Vivaan", "Kavya", "Aditya", "Nisha", "Karthik", "Pooja", "Siddharth", "Riya", "Neha", "Varun", "Tanvi", "Manish", "Shreya", "Harsh", "Divya", "Nikhil", "Aisha", "Pranav"];
const LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Kulkarni", "Patel", "Menon", "Gupta", "Desai", "Rao", "Joshi", "Shetty", "Pillai", "Bhat", "Kapoor", "Das"];
const STREETS = ["5th Cross, 4th Block", "17th Main, HSR Layout Sector 2", "Indiranagar 100 Feet Road", "ITPL Main Road", "Karve Road", "Baner Road", "Gachibowli Main Road", "Jubilee Hills Road No. 36", "80 Feet Road, 6th Block", "Marathahalli Outer Ring Road"];

async function main() {
  console.log("Wiping database…");
  await wipe();

  // ── RBAC mirror ──
  const perms = await Promise.all(Object.entries(PERMISSIONS).map(([key, description]) => db.permission.create({ data: { key, description } })));
  const permId = new Map(perms.map((p) => [p.key, p.id]));
  const roleNames: Record<RoleKey, string> = {
    CUSTOMER: "Customer",
    COLLECTOR: "Pickup Executive",
    WAREHOUSE_MANAGER: "Warehouse Manager",
    ADMIN: "Admin",
    SUPER_ADMIN: "Super Admin",
    B2B_BUYER: "B2B Buyer",
    RECYCLER_PARTNER: "Recycler Partner",
    DONATION_PARTNER: "Donation Partner",
  };
  const roles = {} as Record<RoleKey, string>;
  for (const [key, name] of Object.entries(roleNames) as [RoleKey, string][]) {
    const r = await db.role.create({ data: { key, name, permissions: { create: ROLE_PERMISSIONS[key].map((p) => ({ permissionId: permId.get(p)! })) } } });
    roles[key] = r.id;
  }

  // ── Templates ──
  const templates = [
    ["booking.confirmed", "SMS", null, "ReWear: free pickup {{code}} confirmed for {{date}} {{slot}}. Doorstep code {{pickupCode}}."],
    ["booking.confirmed", "WHATSAPP", null, "Your *free* ReWear pickup {{code}} is booked for {{date}}, {{slot}}. Share code *{{pickupCode}}* with your collector."],
    ["valuation.ready", "SMS", null, "ReWear valuation {{amount}} for {{code}}. Approve in the app or share code {{otp}} with the collector."],
    ["payout.successful", "SMS", null, "ReWear: {{amount}} sent to {{vpa}}. UTR {{utr}}."],
    ["payout.successful", "EMAIL", "Your ReWear payment is on its way", "Hi {{name}}, {{amount}} for booking {{code}} has been paid to your UPI ID {{vpa}} (UTR {{utr}})."],
    ["order.confirmed", "EMAIL", "Order {{code}} confirmed", "Thanks for choosing pre-loved. We'll pack order {{code}} within 24 hours."],
  ] as const;
  for (const [key, channel, subject, body] of templates) await db.notificationTemplate.create({ data: { key, channel, subject, body } });

  // ── Catalogue ──
  const cats: Awaited<ReturnType<typeof db.clothingCategory.create>>[] = [];
  for (const [i, c] of CATEGORIES.entries()) {
    cats.push(await db.clothingCategory.create({ data: { slug: c.slug, name: c.name, description: c.description, group: c.group, sortOrder: i, imageUrl: categoryImages[c.slug] } }));
  }
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  // ── Staff accounts (needed as approvers) ──
  const mkUser = (phone: string, name: string, role: RoleKey, extra: Partial<Prisma.UserCreateInput> = {}) =>
    db.user.create({ data: { phone, name, roleId: roles[role], phoneVerified: true, ...extra } as Prisma.UserUncheckedCreateInput });
  const superAdmin = await mkUser("+919000000006", "Vikram Iyer", "SUPER_ADMIN", { email: "vikram@rewear.example" });
  const admin = await mkUser("+919000000005", "Priya Sharma", "ADMIN", { email: "priya@rewear.example" });

  // ── Pricing with history and maker–checker ──
  const ninetyAgo = new Date(now.getTime() - 120 * DAY);
  const thirtyAgo = new Date(now.getTime() - 30 * DAY);
  for (const c of CATEGORIES) {
    const cat = catBySlug.get(c.slug)!;
    // Old rate (expired 30 days ago) → current rate, to demonstrate pricing history.
    const old = await db.pricingRule.create({
      data: { categoryId: cat.id, channel: "KG_BUYBACK", pricePerKgPaise: (c.kg - 2) * 100, effectiveFrom: ninetyAgo, effectiveTo: thirtyAgo, approvalStatus: "APPROVED", requestedById: admin.id, approvedById: superAdmin.id, approvedAt: ninetyAgo },
    });
    await db.pricingHistory.createMany({ data: [
      { pricingRuleId: old.id, action: "CREATED", newPricePaise: old.pricePerKgPaise, actorId: admin.id, createdAt: ninetyAgo },
      { pricingRuleId: old.id, action: "APPROVED", newPricePaise: old.pricePerKgPaise, actorId: superAdmin.id, createdAt: ninetyAgo },
      { pricingRuleId: old.id, action: "EXPIRED", oldPricePaise: old.pricePerKgPaise, actorId: superAdmin.id, createdAt: thirtyAgo, note: "Seasonal rate revision" },
    ] });
    const cur = await db.pricingRule.create({
      data: { categoryId: cat.id, channel: "KG_BUYBACK", pricePerKgPaise: c.kg * 100, effectiveFrom: thirtyAgo, approvalStatus: "APPROVED", requestedById: admin.id, approvedById: superAdmin.id, approvedAt: thirtyAgo },
    });
    await db.pricingHistory.createMany({ data: [
      { pricingRuleId: cur.id, action: "CREATED", newPricePaise: cur.pricePerKgPaise, actorId: admin.id, createdAt: thirtyAgo },
      { pricingRuleId: cur.id, action: "APPROVED", oldPricePaise: old.pricePerKgPaise, newPricePaise: cur.pricePerKgPaise, actorId: superAdmin.id, createdAt: thirtyAgo },
    ] });
    if (c.premium) await db.pricingRule.create({ data: { categoryId: cat.id, channel: "PREMIUM_RESALE", pricePerKgPaise: c.premium * 100, effectiveFrom: ninetyAgo, approvalStatus: "APPROVED", requestedById: admin.id, approvedById: superAdmin.id, approvedAt: ninetyAgo } });
    await db.pricingRule.create({ data: { categoryId: cat.id, channel: "RECYCLING", pricePerKgPaise: c.recycle * 100, effectiveFrom: ninetyAgo, approvalStatus: "APPROVED", requestedById: admin.id, approvedById: superAdmin.id, approvedAt: ninetyAgo } });
  }
  // City-specific + condition-specific examples, and one rule awaiting approval.
  await db.pricingRule.create({ data: { categoryId: catBySlug.get("jeans")!.id, channel: "KG_BUYBACK", city: "Bengaluru", pricePerKgPaise: 2200, effectiveFrom: thirtyAgo, approvalStatus: "APPROVED", requestedById: admin.id, approvedById: superAdmin.id, approvedAt: thirtyAgo, notes: "Higher denim demand in Bengaluru" } });
  await db.pricingRule.create({ data: { categoryId: catBySlug.get("jackets")!.id, channel: "PREMIUM_RESALE", condition: "EXCELLENT", pricePerKgPaise: 9000, effectiveFrom: thirtyAgo, approvalStatus: "APPROVED", requestedById: admin.id, approvedById: superAdmin.id, approvedAt: thirtyAgo } });
  const pending = await db.pricingRule.create({ data: { categoryId: catBySlug.get("sarees")!.id, channel: "KG_BUYBACK", pricePerKgPaise: 2000, effectiveFrom: new Date(now.getTime() + 3 * DAY), approvalStatus: "PENDING", requestedById: admin.id, notes: "Wedding season uplift for sarees" } });
  await db.pricingHistory.create({ data: { pricingRuleId: pending.id, action: "CREATED", newPricePaise: 2000, actorId: admin.id, note: "Wedding season uplift for sarees" } });

  // ── Service areas, slots, warehouses ──
  const areas = [];
  for (const a of AREAS) {
    const area = await db.serviceArea.create({
      data: {
        name: a.name, city: a.city, state: a.state, zone: a.zone, pincodes: a.pincodes, operatingDays: [1, 2, 3, 4, 5, 6, 0], logisticsCostPerPickupPaise: 9000,
        slots: { create: [
          { label: "9 – 11 AM", startTime: "09:00", endTime: "11:00", capacity: 8 },
          { label: "11 AM – 1 PM", startTime: "11:00", endTime: "13:00", capacity: 8 },
          { label: "2 – 4 PM", startTime: "14:00", endTime: "16:00", capacity: 8 },
          { label: "4 – 6 PM", startTime: "16:00", endTime: "18:00", capacity: 6 },
        ] },
      },
      include: { slots: true },
    });
    areas.push({ ...area, wh: a.wh });
  }
  const warehouses = {
    "BLR-HUB-01": await db.warehouseLocation.create({ data: { code: "BLR-HUB-01", name: "Bengaluru Circular Hub", city: "Bengaluru", serviceAreaId: areas[0].id, address: "Plot 14, KIADB Industrial Area, Bommasandra" } }),
    "BLR-HUB-02": await db.warehouseLocation.create({ data: { code: "BLR-HUB-02", name: "Bengaluru Overflow Store", city: "Bengaluru", serviceAreaId: areas[1].id, address: "Hoodi Industrial Area" } }),
    "PUN-HUB-01": await db.warehouseLocation.create({ data: { code: "PUN-HUB-01", name: "Pune Sorting Centre", city: "Pune", serviceAreaId: areas[2].id, address: "Bhosari MIDC, Pune" } }),
    "HYD-HUB-01": await db.warehouseLocation.create({ data: { code: "HYD-HUB-01", name: "Hyderabad Sorting Centre", city: "Hyderabad", serviceAreaId: areas[3].id, address: "Kukatpally Industrial Estate" } }),
  };

  // ── Demo accounts for every role ──
  const mkCustomer = async (phone: string, name: string, email?: string) =>
    db.user.create({ data: { phone, name, email, roleId: roles.CUSTOMER, phoneVerified: true, customerProfile: { create: { referralCode: `RW${randomCode(6)}` } } }, include: { customerProfile: true } });
  const ananya = await mkCustomer("+919000000001", "Ananya Rao", "ananya.demo@rewear.example");
  const rahul = await mkCustomer("+919000000002", "Rahul Mehta");
  const warehouseMgr = await mkUser("+919000000004", "Lakshmi Narayan", "WAREHOUSE_MANAGER");
  const warehouseMgr2 = await mkUser("+919000000014", "Joseph Fernandes", "WAREHOUSE_MANAGER");

  const collectors = [];
  for (const [phone, name, areaIdx, vehicle] of [
    ["+919000000003", "Suresh Kumar", 0, "KA-01-EK-4471"],
    ["+919000000013", "Imran Khan", 1, "KA-03-HB-2290"],
    ["+919000000023", "Ganesh Patil", 2, "MH-12-QT-8812"],
    ["+919000000033", "Venkat Reddy", 3, "TS-09-FA-1034"],
    ["+919000000043", "Manjunath Gowda", 0, "KA-05-MN-7719"],
  ] as const) {
    const u = await mkUser(phone, name, "COLLECTOR");
    collectors.push(await db.collectorProfile.create({ data: { userId: u.id, employeeCode: `RWC-${randomCode(5)}`, serviceAreaId: areas[areaIdx].id, vehicleNumber: vehicle, dailyCapacity: 12 }, include: { user: true } }));
  }

  const b2bUser = await mkUser("+919000000007", "Meenal Joshi", "B2B_BUYER", { email: "buying@secondchancethrift.example" });
  const thrift = await db.businessProfile.create({
    data: { userId: b2bUser.id, legalName: "Second Chance Thrift Co. Pvt Ltd", tradeName: "Second Chance Thrift", businessType: "THRIFT_STORE", gstin: "29AAICS1234F1Z5", contactEmail: "buying@secondchancethrift.example", contactPhone: "+919000000007", addressLine: "12 Commercial Street", city: "Bengaluru", state: "Karnataka", pincode: "560001", verificationStatus: "VERIFIED", verifiedAt: new Date(now.getTime() - 40 * DAY), verifiedById: admin.id, discountBps: 500, priceTier: "PARTNER" },
  });
  const pendingBizUser = await mkUser("+919000000017", "Farhan Ali", "B2B_BUYER");
  await db.businessProfile.create({ data: { userId: pendingBizUser.id, legalName: "Loom & Again Upcycling LLP", businessType: "UPCYCLER", gstin: "27AAJFL9876K1Z2", addressLine: "Unit 4, Kasba Peth", city: "Pune", state: "Maharashtra", pincode: "411011", verificationStatus: "PENDING" } });

  const recyclerUser = await mkUser("+919000000008", "Deepak Agarwal", "RECYCLER_PARTNER");
  const recycler = await db.recyclerPartner.create({
    data: { userId: recyclerUser.id, name: "GreenLoop Textile Recyclers", licenseNumber: "KSPCB/TR/2024/0193", pollutionCertNo: "CTO-48817", city: "Bengaluru", materialsAccepted: ["Cotton", "Denim", "Polyester blends", "Mixed fibre"], verificationStatus: "VERIFIED", verifiedAt: new Date(now.getTime() - 50 * DAY), ratePerKgPaise: 900 },
  });

  const ngoUser = await mkUser("+919000000009", "Sister Mary Thomas", "DONATION_PARTNER");
  const ngo = await db.donationPartner.create({ data: { userId: ngoUser.id, name: "Vastra Seva Foundation", registrationNo: "KA/BLR/SOC/2011/0442", has80G: true, city: "Bengaluru", focusAreas: ["Winter clothing drives", "Rural schools"], description: "Distributes wearable clothing to families in peri-urban Karnataka.", verificationStatus: "VERIFIED" } });
  await db.donationPartner.create({ data: { name: "Little Threads Trust", registrationNo: "MH/PUN/TR/2016/118", has80G: false, city: "Pune", focusAreas: ["Kidswear", "Shelter homes"], description: "School uniforms and kidswear for shelter homes in Pune.", verificationStatus: "VERIFIED" } });

  // Extra customers for realistic history.
  const customers = [ananya, rahul];
  for (let i = 0; i < 26; i++) {
    const name = `${FIRST[i % FIRST.length]} ${pick(LAST)}`;
    customers.push(await mkCustomer(`+9198${String(45000000 + i * 7919).padStart(8, "0")}`, name));
  }
  await db.referral.create({ data: { referrerId: ananya.id, refereeId: customers[5].id, status: "QUALIFIED", qualifiedAt: new Date(now.getTime() - 20 * DAY) } });
  await db.referral.create({ data: { referrerId: ananya.id, refereeId: rahul.id, status: "PENDING" } });

  // Addresses + UPI
  const addresses = new Map<string, { id: string; areaIdx: number }>();
  for (const [i, c] of customers.entries()) {
    const areaIdx = c.id === ananya.id ? 0 : c.id === rahul.id ? 1 : i % AREAS.length;
    const a = AREAS[areaIdx];
    const addr = await db.address.create({
      data: { userId: c.id, label: "Home", contactName: c.name!, contactPhone: c.phone!, line1: `Flat ${between(101, 1204)}, ${pick(["Prestige", "Sobha", "Brigade", "Mantri", "Lodha", "My Home"])} ${pick(["Lakeside", "Meadows", "Heights", "Residency", "Greens"])}`, line2: pick(STREETS), city: a.city, state: a.state, pincode: a.pincodes[i % a.pincodes.length], serviceAreaId: areas[areaIdx].id, isDefault: true, latitude: 12.9 + rand() * 0.1, longitude: 77.6 + rand() * 0.1 },
    });
    addresses.set(c.id, { id: addr.id, areaIdx });
    if (c.id !== rahul.id) {
      const handle = c.name!.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10);
      await db.upiAccount.create({ data: { userId: c.id, vpa: `${handle}${between(10, 99)}@${pick(["okaxis", "okhdfcbank", "oksbi", "ybl", "paytm"])}`, verified: true, verifiedAt: new Date(now.getTime() - 70 * DAY), isPrimary: true, nameAtBank: c.name } });
    }
  }
  await db.address.create({ data: { userId: ananya.id, label: "Parents' home", contactName: "Ananya Rao", contactPhone: ananya.phone!, line1: "No. 22, 2nd Main", line2: "Jayanagar 4th Block", city: "Bengaluru", state: "Karnataka", pincode: "560011", isDefault: false } });

  // ── Historic completed bookings with weighing, valuation, payout & ledger ──
  console.log("Creating booking history…");
  const rateFor = (slug: string, city: string) => (slug === "jeans" && city === "Bengaluru" ? 2200 : CATEGORIES.find((c) => c.slug === slug)!.kg * 100);
  const bins = new Map<string, string>(); // consolidated grade bins per warehouse+grade+category
  const binFor = async (whCode: keyof typeof warehouses, grade: SortGrade, categoryId: string) => {
    const k = `${whCode}:${grade}:${categoryId}`;
    if (bins.has(k)) return bins.get(k)!;
    const item = await db.inventoryItem.create({ data: { code: `${grade.slice(0, 3)}-${randomCode(8)}`, kind: "LOT", grade, categoryId, warehouseId: warehouses[whCode].id, weightGrams: 0, status: grade === "REJECTED" ? "SCRAPPED" : "IN_STOCK", inspectionPassed: ["PREMIUM_REUSABLE", "STANDARD_REUSABLE"].includes(grade), title: `Consolidated ${grade.replace(/_/g, " ").toLowerCase()} — ${whCode}` } });
    bins.set(k, item.id);
    return item.id;
  };
  const SPLIT: [SortGrade, number][] = [["PREMIUM_REUSABLE", 0.08], ["STANDARD_REUSABLE", 0.46], ["REPAIRABLE", 0.07], ["RECYCLABLE", 0.28], ["UPCYCLING", 0.06]];

  const slugsPool = ["mens-wear", "womens-wear", "kidswear", "sarees", "ethnic-wear", "jeans", "trousers", "shirts", "t-shirts", "dresses", "jackets", "sweaters", "other-textiles"];
  let bookingCount = 0;
  for (let d = 62; d >= 1; d--) {
    const day = istDay(-d);
    const perDay = between(2, d < 20 ? 5 : 4);
    for (let k = 0; k < perDay; k++) {
      const customer = d === 3 && k === 0 ? ananya : d === 18 && k === 0 ? ananya : d === 40 && k === 0 ? ananya : pick(customers.slice(2));
      const { id: addressId, areaIdx } = addresses.get(customer.id)!;
      const area = areas[areaIdx];
      const city = AREAS[areaIdx].city;
      const slot = pick(area.slots);
      const collector = collectors.find((c) => c.serviceAreaId === area.id)!;
      const chosen = [...new Set([pick(slugsPool), pick(slugsPool), pick(slugsPool)])];
      const estGrams = between(4, 22) * 1000;
      const per = Math.floor(estGrams / chosen.length);
      const items = chosen.map((slug) => ({ slug, cat: catBySlug.get(slug)!, grams: per, rate: rateFor(slug, city) }));
      const code = humanCode("RW");
      const actualWeights = items.map((it) => ({ categoryId: it.cat.id, grams: Math.max(500, Math.round(it.grams * (0.85 + rand() * 0.3) / 10) * 10) }));
      const rejectedGrams = rand() < 0.3 ? between(2, 8) * 100 : 0;
      const tare = between(3, 9) * 100;
      const net = actualWeights.reduce((s2, w) => s2 + w.grams, 0) + rejectedGrams;
      const gross = net + tare;
      const lines = actualWeights.map((w, i) => ({ categoryId: w.categoryId, name: items[i].cat.name, grams: w.grams, ratePaisePerKg: items[i].rate, pricingRuleId: null, subtotalPaise: Math.round((w.grams * items[i].rate) / 1000) }));
      const payable = lines.reduce((s2, l) => s2 + l.subtotalPaise, 0);
      const pickupAt = at(day, Number(slot.startTime.slice(0, 2)), between(5, 90));
      const createdAt = new Date(pickupAt.getTime() - between(1, 4) * DAY);

      const booking = await db.booking.create({
        data: {
          code, customerId: customer.id, channel: "KG_BUYBACK", status: "COMPLETED", addressId, serviceAreaId: area.id, slotId: slot.id, pickupDate: day,
          estimatedGrams: estGrams, bagCount: between(1, 4), pickupFeePaise: 0,
          estimatedPaise: items.reduce((s2, it) => s2 + Math.round((it.grams * it.rate) / 1000), 0),
          pricingSnapshot: { pricedAt: createdAt.toISOString(), channel: "KG_BUYBACK", serviceAreaId: area.id, city, pickupFeePaise: 0, rates: items.map((it) => ({ categoryId: it.cat.id, name: it.cat.name, ratePaisePerKg: it.rate, pricingRuleId: null })) },
          pickupOtpHash: sha256(pickupCode(code)), completedAt: new Date(pickupAt.getTime() + 25 * 60_000), createdAt,
          items: { create: items.map((it) => ({ categoryId: it.cat.id, estimatedGrams: it.grams, ratePaisePerKg: it.rate, estimatedPaise: Math.round((it.grams * it.rate) / 1000) })) },
          assignments: { create: { collectorId: collector.id, assignedAt: createdAt } },
          events: { create: [
            { type: "CREATED", actorId: customer.id, createdAt },
            { type: "ASSIGNED", createdAt: new Date(createdAt.getTime() + 60_000), meta: { collectorId: collector.id } },
            { type: "EN_ROUTE", actorId: collector.userId, createdAt: new Date(pickupAt.getTime() - 20 * 60_000) },
            { type: "OTP_VERIFIED", actorId: collector.userId, createdAt: pickupAt },
            { type: "WEIGHED", actorId: collector.userId, createdAt: new Date(pickupAt.getTime() + 10 * 60_000) },
            { type: "VALUATION_APPROVED", actorId: collector.userId, createdAt: new Date(pickupAt.getTime() + 18 * 60_000), meta: { method: "DOORSTEP_OTP" } },
            { type: "COMPLETED", actorId: collector.userId, createdAt: new Date(pickupAt.getTime() + 25 * 60_000) },
          ] },
        },
      });
      const w = await db.weighingRecord.create({ data: { bookingId: booking.id, recordedById: collector.userId, grossGrams: gross, tareGrams: tare, netGrams: net, categoryWeights: actualWeights, rejectedGrams, location: "doorstep", createdAt: new Date(pickupAt.getTime() + 10 * 60_000) } });
      const v = await db.valuation.create({ data: { bookingId: booking.id, weighingId: w.id, version: 1, status: "APPROVED", lines, grossGrams: gross, tareGrams: tare, netGrams: net, subtotalPaise: payable, payablePaise: payable, approvedAt: new Date(pickupAt.getTime() + 18 * 60_000), approvalMethod: rand() < 0.6 ? "DOORSTEP_OTP" : "APP", createdById: collector.userId, createdAt: w.createdAt } });

      // Payout
      const upi = await db.upiAccount.findFirst({ where: { userId: customer.id, isPrimary: true } });
      const done = new Date(pickupAt.getTime() + between(40, 180) * 60_000);
      const recent = d <= 1;
      const failedFirst = rand() < 0.07;
      const status = !upi ? "AWAITING_APPROVAL" : recent ? "PROCESSING" : "SUCCESSFUL";
      const pcode = humanCode("PO");
      const payout = await db.payout.create({
        data: { code: pcode, bookingId: booking.id, customerId: customer.id, valuationId: v.id, amountPaise: payable, upiVpa: upi?.vpa ?? null, provider: "sandbox", status, providerRef: upi ? `pout_sbx_${randomCode(14)}` : null, utr: status === "SUCCESSFUL" ? `4${between(10000000, 99999999)}${between(100, 999)}` : null, approvedAt: upi ? booking.completedAt : null, approvedById: payable > 150000 ? admin.id : null, completedAt: status === "SUCCESSFUL" ? done : null, attemptCount: upi ? (failedFirst ? 2 : 1) : 0, createdAt: booking.completedAt! },
      });
      if (upi) {
        if (failedFirst) await db.payoutAttempt.create({ data: { payoutId: payout.id, attemptNumber: 1, idempotencyKey: `${pcode}-A1`, status: "FAILED", providerRef: `pout_sbx_${randomCode(14)}`, failureReason: "Beneficiary bank was unavailable", createdAt: booking.completedAt! } });
        await db.payoutAttempt.create({ data: { payoutId: payout.id, attemptNumber: failedFirst ? 2 : 1, idempotencyKey: `${pcode}-A${failedFirst ? 2 : 1}`, status: status === "SUCCESSFUL" ? "SUCCESSFUL" : "PROCESSING", providerRef: payout.providerRef, utr: payout.utr, createdAt: booking.completedAt! } });
        // Mirror the attempt in the sandbox provider so reconciliation can resolve it.
        await db.sandboxTransaction.create({ data: { kind: "PAYOUT", idempotencyKey: `${pcode}-A${failedFirst ? 2 : 1}`, reference: payout.providerRef!, amountPaise: payable, destination: upi.vpa, status: status === "SUCCESSFUL" ? "processed" : "processing", utr: payout.utr, createdAt: booking.completedAt! } });
        await db.financialLedger.createMany({ data: [
          { entryGroup: `payout:${payout.id}:accrual:${v.id}`, account: "CUSTOMER_PAYOUTS", direction: "DEBIT", amountPaise: payable, referenceType: "PAYOUT", referenceId: payout.id, bookingId: booking.id, customerId: customer.id, description: `Customer payout approved ${pcode}`, idempotencyKey: `payout:${payout.id}:accrual:${v.id}:0`, createdAt: booking.completedAt! },
          { entryGroup: `payout:${payout.id}:accrual:${v.id}`, account: "PAYOUT_CLEARING", direction: "CREDIT", amountPaise: payable, referenceType: "PAYOUT", referenceId: payout.id, bookingId: booking.id, customerId: customer.id, description: `Customer payout approved ${pcode}`, idempotencyKey: `payout:${payout.id}:accrual:${v.id}:1`, createdAt: booking.completedAt! },
        ] });
        if (status === "SUCCESSFUL") {
          await db.financialLedger.createMany({ data: [
            { entryGroup: `payout:${payout.id}:settle`, account: "PAYOUT_CLEARING", direction: "DEBIT", amountPaise: payable, referenceType: "PAYOUT", referenceId: payout.id, bookingId: booking.id, customerId: customer.id, description: `UPI payout settled ${pcode}`, idempotencyKey: `payout:${payout.id}:settle:0`, createdAt: done },
            { entryGroup: `payout:${payout.id}:settle`, account: "BANK", direction: "CREDIT", amountPaise: payable, referenceType: "PAYOUT", referenceId: payout.id, bookingId: booking.id, customerId: customer.id, description: `UPI payout settled ${pcode}`, idempotencyKey: `payout:${payout.id}:settle:1`, createdAt: done },
          ] });
        }
      }
      // Reward points
      const pts = Math.floor((net - rejectedGrams) / 1000) * 2;
      if (pts > 0) {
        await db.rewardTransaction.create({ data: { userId: customer.id, type: "MILESTONE", points: pts, description: `${Math.floor((net - rejectedGrams) / 1000)} kg given a second life (${code})`, idempotencyKey: `booking:${booking.id}:kg`, createdAt: booking.completedAt! } });
        await db.customerProfile.update({ where: { userId: customer.id }, data: { rewardPoints: { increment: pts } } });
      }

      // Warehouse: older bookings are received & sorted (into consolidated bins); recent ones await receiving.
      if (d >= 3) {
        const whCode = area.wh as keyof typeof warehouses;
        const accepted = net - rejectedGrams;
        const received = accepted - between(0, 60);
        const batch = await db.collectionBatch.create({ data: { code: humanCode("BT"), bookingId: booking.id, warehouseId: warehouses[whCode].id, collectorId: collector.id, receivedById: warehouseMgr.id, collectedGrams: accepted, receivedGrams: received, varianceGrams: received - accepted, status: d >= 5 ? "SORTED" : "RECEIVED", receivedAt: new Date(pickupAt.getTime() + 6 * 3600_000), sortedAt: d >= 5 ? new Date(pickupAt.getTime() + 30 * 3600_000) : null } });
        const unsorted = await db.inventoryItem.create({ data: { code: `UNS-${randomCode(8)}`, kind: "LOT", grade: "UNSORTED", categoryId: actualWeights[0].categoryId, batchId: batch.id, warehouseId: warehouses[whCode].id, weightGrams: received, title: `Unsorted — ${code}`, createdAt: batch.receivedAt } });
        await db.inventoryMovement.create({ data: { itemId: unsorted.id, type: "RECEIVE", deltaGrams: received, actorId: warehouseMgr.id, referenceType: "BATCH", referenceId: batch.id, toWarehouseId: warehouses[whCode].id, createdAt: batch.receivedAt } });
        await db.pickupEvent.create({ data: { bookingId: booking.id, type: "RECEIVED_AT_WAREHOUSE", actorId: warehouseMgr.id, note: `${warehouses[whCode].name} · ${batch.code}`, createdAt: batch.receivedAt } });
        if (d >= 5) {
          let sorted = 0;
          for (const [grade, pct] of SPLIT) {
            const g = Math.round((received * pct) / 10) * 10;
            if (g <= 0) continue;
            const cat = grade === "RECYCLABLE" || grade === "UPCYCLING" ? actualWeights[0].categoryId : pick(actualWeights).categoryId;
            const bin = await binFor(whCode, grade, cat);
            await db.inventoryItem.update({ where: { id: bin }, data: { weightGrams: { increment: g } } });
            await db.inventoryMovement.create({ data: { itemId: bin, type: "SORT_IN", deltaGrams: g, actorId: warehouseMgr.id, referenceType: "BATCH", referenceId: batch.id, createdAt: batch.sortedAt! } });
            sorted += g;
          }
          await db.inventoryItem.update({ where: { id: unsorted.id }, data: { weightGrams: 0, status: "SCRAPPED" } });
          await db.inventoryMovement.create({ data: { itemId: unsorted.id, type: "SORT_OUT", deltaGrams: -sorted, actorId: warehouseMgr.id, referenceType: "BATCH", referenceId: batch.id, createdAt: batch.sortedAt! } });
          if (received - sorted > 0) await db.inventoryMovement.create({ data: { itemId: unsorted.id, type: "ADJUSTMENT", deltaGrams: -(received - sorted), reason: "Sorting loss (moisture / dust / trims)", actorId: warehouseMgr.id, referenceType: "BATCH", referenceId: batch.id, createdAt: batch.sortedAt! } });
          await db.collectionBatch.update({ where: { id: batch.id }, data: { sortedGrams: sorted, varianceGrams: sorted - received } });
          await db.qualityInspection.create({ data: { batchId: batch.id, inspectorId: warehouseMgr.id, result: "PASSED", grade: "STANDARD_REUSABLE", notes: "Batch graded", createdAt: batch.sortedAt! } });
        }
      }
      bookingCount++;
    }
  }
  console.log(`  ${bookingCount} completed bookings`);

  // ── Live operational state for today's demo ──
  const today = istDay(0);
  const tomorrow = istDay(1);
  const area0 = areas[0];
  const suresh = collectors[0];
  const liveBooking = async (opts: { customerId: string; status: "SCHEDULED" | "ASSIGNED" | "EN_ROUTE" | "IN_PROGRESS" | "AWAITING_APPROVAL"; day: Date; slotIdx: number; slugs: string[]; kg: number; collector?: typeof suresh; channel?: "KG_BUYBACK" | "DONATION"; donationPartnerId?: string }) => {
    const code = humanCode("RW");
    const slot = area0.slots[opts.slotIdx];
    const per = Math.floor((opts.kg * 1000) / opts.slugs.length);
    const its = opts.slugs.map((slug) => ({ cat: catBySlug.get(slug)!, rate: opts.channel === "DONATION" ? 0 : rateFor(slug, "Bengaluru") }));
    const est = its.reduce((s2, it) => s2 + Math.round((per * it.rate) / 1000), 0);
    const b = await db.booking.create({
      data: {
        code, customerId: opts.customerId, channel: opts.channel ?? "KG_BUYBACK", status: opts.status, addressId: addresses.get(opts.customerId)!.id, serviceAreaId: area0.id, slotId: slot.id, pickupDate: opts.day,
        estimatedGrams: opts.kg * 1000, bagCount: 2, pickupFeePaise: 0, estimatedPaise: est, instructions: "Please call when you reach the gate — security will let you in.", donationPartnerId: opts.donationPartnerId,
        pricingSnapshot: { pricedAt: new Date().toISOString(), channel: opts.channel ?? "KG_BUYBACK", serviceAreaId: area0.id, city: "Bengaluru", pickupFeePaise: 0, rates: its.map((it) => ({ categoryId: it.cat.id, name: it.cat.name, ratePaisePerKg: it.rate, pricingRuleId: null })) },
        pickupOtpHash: sha256(pickupCode(code)),
        items: { create: its.map((it) => ({ categoryId: it.cat.id, estimatedGrams: per, ratePaisePerKg: it.rate, estimatedPaise: Math.round((per * it.rate) / 1000) })) },
        events: { create: [{ type: "CREATED", actorId: opts.customerId }] },
        ...(opts.collector ? { assignments: { create: { collectorId: opts.collector.id } } } : {}),
      },
    });
    if (opts.collector) await db.pickupEvent.create({ data: { bookingId: b.id, type: "ASSIGNED", meta: { collectorId: opts.collector.id } } });
    if (opts.channel === "DONATION" && opts.donationPartnerId) await db.donation.create({ data: { code: humanCode("DN"), bookingId: b.id, donorId: opts.customerId, partnerId: opts.donationPartnerId } });
    return b;
  };
  const bengaluruCustomers = customers.filter((c) => addresses.get(c.id)!.areaIdx === 0 && c.id !== ananya.id);
  // Ananya: an upcoming pickup and one awaiting her approval.
  await liveBooking({ customerId: ananya.id, status: "ASSIGNED", day: tomorrow, slotIdx: 1, slugs: ["sarees", "womens-wear"], kg: 8, collector: suresh });
  const awaiting = await liveBooking({ customerId: ananya.id, status: "AWAITING_APPROVAL", day: today, slotIdx: 0, slugs: ["jeans", "t-shirts", "kidswear"], kg: 12, collector: suresh });
  {
    const weights = [{ categoryId: catBySlug.get("jeans")!.id, grams: 4820 }, { categoryId: catBySlug.get("t-shirts")!.id, grams: 3960 }, { categoryId: catBySlug.get("kidswear")!.id, grams: 2700 }];
    const lines = weights.map((w) => {
      const slug = cats.find((c) => c.id === w.categoryId)!.slug;
      const rate = rateFor(slug, "Bengaluru");
      return { categoryId: w.categoryId, name: cats.find((c) => c.id === w.categoryId)!.name, grams: w.grams, ratePaisePerKg: rate, pricingRuleId: null, subtotalPaise: Math.round((w.grams * rate) / 1000) };
    });
    const net = 11480 + 400;
    const wr = await db.weighingRecord.create({ data: { bookingId: awaiting.id, recordedById: suresh.userId, grossGrams: net + 650, tareGrams: 650, netGrams: net, categoryWeights: weights, rejectedGrams: 400, location: "doorstep" } });
    const sub = lines.reduce((s2, l) => s2 + l.subtotalPaise, 0);
    await db.valuation.create({ data: { bookingId: awaiting.id, weighingId: wr.id, version: 1, lines, grossGrams: net + 650, tareGrams: 650, netGrams: net, subtotalPaise: sub, payablePaise: sub, createdById: suresh.userId } });
    await db.pickupEvent.createMany({ data: [
      { bookingId: awaiting.id, type: "EN_ROUTE", actorId: suresh.userId },
      { bookingId: awaiting.id, type: "OTP_VERIFIED", actorId: suresh.userId },
      { bookingId: awaiting.id, type: "WEIGHED", actorId: suresh.userId },
      { bookingId: awaiting.id, type: "VALUATION_SENT", actorId: suresh.userId, meta: { version: 1, payablePaise: sub } },
    ] });
  }
  // Suresh's route for today.
  await liveBooking({ customerId: bengaluruCustomers[0]?.id ?? rahul.id, status: "ASSIGNED", day: today, slotIdx: 2, slugs: ["mens-wear", "shirts"], kg: 6, collector: suresh });
  await liveBooking({ customerId: bengaluruCustomers[1]?.id ?? rahul.id, status: "ASSIGNED", day: today, slotIdx: 3, slugs: ["jackets", "sweaters"], kg: 9, collector: suresh });
  await liveBooking({ customerId: bengaluruCustomers[2]?.id ?? rahul.id, status: "ASSIGNED", day: today, slotIdx: 2, slugs: ["kidswear", "other-textiles"], kg: 5, collector: suresh, channel: "DONATION", donationPartnerId: ngo.id });
  // Unassigned bookings for the admin to dispatch.
  await liveBooking({ customerId: bengaluruCustomers[3]?.id ?? rahul.id, status: "SCHEDULED", day: tomorrow, slotIdx: 0, slugs: ["dresses", "womens-wear"], kg: 7 });
  await liveBooking({ customerId: bengaluruCustomers[4]?.id ?? rahul.id, status: "SCHEDULED", day: tomorrow, slotIdx: 2, slugs: ["trousers"], kg: 4 });

  // Donation history (collected → handed over → acknowledged)
  for (let i = 0; i < 4; i++) {
    const day = istDay(-(10 + i * 6));
    const cust = pick(bengaluruCustomers.length ? bengaluruCustomers : [rahul]);
    const code = humanCode("RW");
    const grams = between(5, 15) * 1000;
    const b = await db.booking.create({
      data: { code, customerId: cust.id, channel: "DONATION", status: "COMPLETED", addressId: addresses.get(cust.id)!.id, serviceAreaId: area0.id, slotId: area0.slots[1].id, pickupDate: day, estimatedGrams: grams, bagCount: 2, pickupFeePaise: 0, estimatedPaise: 0, pricingSnapshot: { channel: "DONATION", rates: [], pickupFeePaise: 0 }, pickupOtpHash: sha256(pickupCode(code)), donationPartnerId: ngo.id, completedAt: at(day, 12), items: { create: [{ categoryId: catBySlug.get("kidswear")!.id, estimatedGrams: grams, ratePaisePerKg: 0, estimatedPaise: 0 }] }, assignments: { create: { collectorId: suresh.id } } },
    });
    await db.weighingRecord.create({ data: { bookingId: b.id, recordedById: suresh.userId, grossGrams: grams + 500, tareGrams: 500, netGrams: grams, categoryWeights: [{ categoryId: catBySlug.get("kidswear")!.id, grams }], location: "doorstep" } });
    await db.donation.create({ data: { code: humanCode("DN"), bookingId: b.id, donorId: cust.id, partnerId: ngo.id, status: i === 0 ? "HANDED_OVER" : i === 1 ? "COLLECTED" : "ACKNOWLEDGED", collectedGrams: grams, receiptNumber: i === 1 ? null : `RW/DON/2026/${String(i + 1).padStart(5, "0")}`, handedOverAt: i === 1 ? null : at(day, 18), acknowledgedAt: i >= 2 ? at(day, 40) : null, acknowledgement: i >= 2 ? "Received with thanks — distributed at our Hosakote winter drive." : null } });
  }

  // ── Premium units → marketplace ──
  console.log("Creating marketplace…");
  const premiumBin = async (slug: string) => binFor("BLR-HUB-01", "PREMIUM_REUSABLE", catBySlug.get(slug)!.id);
  const PRODUCTS: { name: string; brand: string; slug: string; size: string; condition: ClothingCondition; price: number; mrp: number; photos: string[]; gender: string; grams: number; description: string; status?: "SOLD" }[] = [
    { name: "Black leather biker jacket", brand: "Bombay Leather Co.", slug: "jackets", size: "M", condition: "EXCELLENT", price: 3499, mrp: 9999, photos: productPhotos.leatherJacket, gender: "Men", grams: 1400, description: "Genuine leather biker jacket with YKK zips. Light patina on the cuffs, lining intact. Professionally cleaned." },
    { name: "Straight-fit indigo jeans", brand: "Levi's", slug: "jeans", size: "32", condition: "GOOD", price: 899, mrp: 3299, photos: productPhotos.denim, gender: "Men", grams: 650, description: "Classic 5-pocket straight fit. Natural fade, no rips or stains. Inseam 31\"." },
    { name: "Floral print camp-collar shirt", brand: "Bombay Shirt Company", slug: "shirts", size: "L", condition: "EXCELLENT", price: 749, mrp: 2490, photos: productPhotos.floralShirt, gender: "Men", grams: 220, description: "Breezy viscose camp-collar shirt, worn twice. Bold monochrome florals." },
    { name: "White lace midi dress", brand: "Fabindia", slug: "dresses", size: "S", condition: "EXCELLENT", price: 1299, mrp: 3990, photos: productPhotos.laceDress, gender: "Women", grams: 380, description: "Sleeveless cotton-lace midi with full lining. Perfect for summer weddings." },
    { name: "Crisp white oxford shirt", brand: "Van Heusen", slug: "shirts", size: "M", condition: "GOOD", price: 499, mrp: 1899, photos: productPhotos.whiteShirt, gender: "Men", grams: 250, description: "100% cotton oxford, button-down collar. Lightly worn, laundered and pressed." },
    { name: "Grey slub cotton shirt", brand: "Uniqlo", slug: "shirts", size: "L", condition: "GOOD", price: 549, mrp: 1990, photos: productPhotos.greyShirt, gender: "Men", grams: 240, description: "Relaxed fit slub cotton. Minor pilling at the collar, priced accordingly." },
    { name: "Essential white crew tee", brand: "H&M", slug: "t-shirts", size: "M", condition: "EXCELLENT", price: 249, mrp: 799, photos: productPhotos.whiteTee, gender: "Unisex", grams: 180, description: "Heavyweight organic cotton tee. Bright white, no marks." },
    { name: "Chunky knit sweater set (2)", brand: "Marks & Spencer", slug: "sweaters", size: "M", condition: "GOOD", price: 1199, mrp: 4998, photos: productPhotos.sweaters, gender: "Women", grams: 900, description: "Two oversized knit sweaters in oatmeal and cream. Wool blend, gently worn." },
    { name: "Black & white flannel overshirt", brand: "Roadster", slug: "shirts", size: "XL", condition: "GOOD", price: 599, mrp: 1799, photos: productPhotos.flannel, gender: "Men", grams: 420, description: "Brushed cotton flannel. Great layering piece for Bengaluru winters." },
    { name: "Hand-embroidered dupatta", brand: "Handloom", slug: "ethnic-wear", size: "Free", condition: "EXCELLENT", price: 1499, mrp: 4500, photos: productPhotos.embroidered, gender: "Women", grams: 300, description: "Phulkari-style hand embroidery on cotton-silk. Colours vibrant, no pulls." },
    { name: "Kids' fleece jacket", brand: "Decathlon", slug: "kidswear", size: "8–9 Y", condition: "EXCELLENT", price: 449, mrp: 1299, photos: productPhotos.kidsJackets, gender: "Kids", grams: 350, description: "Warm half-zip fleece for school trips. Outgrown, barely used." },
    { name: "Printed long-sleeve maxi dress", brand: "W", slug: "dresses", size: "M", condition: "GOOD", price: 899, mrp: 2999, photos: productPhotos.dresses, gender: "Women", grams: 420, description: "Flowy rayon maxi with ditsy print. Slight fade from washing.", status: "SOLD" },
  ];
  const products = [];
  for (const p of PRODUCTS) {
    const bin = await premiumBin(p.slug);
    await db.inventoryItem.update({ where: { id: bin }, data: { weightGrams: { increment: p.grams } } });
    const unit = await db.inventoryItem.create({ data: { code: `PRM-${randomCode(8)}`, kind: "UNIT", grade: "PREMIUM_REUSABLE", categoryId: catBySlug.get(p.slug)!.id, warehouseId: warehouses["BLR-HUB-01"].id, weightGrams: p.grams, quantity: p.status === "SOLD" ? 0 : 1, title: p.name, brand: p.brand, size: p.size, condition: p.condition, inspectionPassed: true, status: p.status === "SOLD" ? "SOLD" : "LISTED", costPaise: 4000 } });
    await db.inventoryMovement.create({ data: { itemId: unit.id, type: "SORT_IN", deltaGrams: p.grams, deltaQuantity: 1, actorId: warehouseMgr.id, reason: "Premium unit from consolidated bin" } });
    await db.qualityInspection.create({ data: { itemId: unit.id, inspectorId: warehouseMgr.id, result: "PASSED", grade: "PREMIUM_REUSABLE", notes: "Stitching, zips and fabric checked; laundered." } });
    products.push(
      await db.marketplaceProduct.create({
        data: { slug: `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomCode(4).toLowerCase()}`, inventoryItemId: unit.id, name: p.name, brand: p.brand, categoryId: catBySlug.get(p.slug)!.id, gender: p.gender, size: p.size, condition: p.condition, description: p.description, pricePaise: p.price * 100, mrpPaise: p.mrp * 100, quantity: p.status === "SOLD" ? 0 : 1, photoUrls: p.photos, status: p.status === "SOLD" ? "SOLD_OUT" : "PUBLISHED", publishedAt: new Date(now.getTime() - between(2, 20) * DAY), createdById: warehouseMgr.id },
      }),
    );
  }
  // A draft awaiting inspection (cannot be published yet).
  {
    const unit = await db.inventoryItem.create({ data: { code: `PRM-${randomCode(8)}`, kind: "UNIT", grade: "PREMIUM_REUSABLE", categoryId: catBySlug.get("sarees")!.id, warehouseId: warehouses["BLR-HUB-01"].id, weightGrams: 700, title: "Kanjivaram silk saree", brand: "Handloom", size: "Free", condition: "GOOD", inspectionPassed: false } });
    await db.marketplaceProduct.create({ data: { slug: `kanjivaram-silk-saree-${randomCode(4).toLowerCase()}`, inventoryItemId: unit.id, name: "Kanjivaram silk saree", brand: "Handloom", categoryId: catBySlug.get("sarees")!.id, gender: "Women", size: "Free", condition: "GOOD", description: "Maroon and gold zari border. Awaiting zari and fall inspection.", pricePaise: 450000, mrpPaise: 1800000, photoUrls: productPhotos.embroidered, status: "DRAFT", createdById: warehouseMgr.id } });
  }
  // A delivered order with a verified review.
  {
    const sold = products[products.length - 1];
    const order = await db.marketplaceOrder.create({
      data: { code: humanCode("OD"), buyerId: rahul.id, status: "DELIVERED", paymentStatus: "CAPTURED", subtotalPaise: sold.pricePaise, shippingPaise: 4900, totalPaise: sold.pricePaise + 4900, shippingAddress: { name: "Rahul Mehta", line1: "Whitefield", city: "Bengaluru", pincode: "560066" }, paymentProvider: "sandbox", paymentRef: `order_sbx_${randomCode(14)}`, paidAt: new Date(now.getTime() - 9 * DAY), shippedAt: new Date(now.getTime() - 8 * DAY), deliveredAt: new Date(now.getTime() - 6 * DAY), courier: "Delhivery", trackingNumber: "DLV7731902245", createdAt: new Date(now.getTime() - 9 * DAY), items: { create: { productId: sold.id, name: sold.name, pricePaise: sold.pricePaise, quantity: 1 } } },
    });
    await db.financialLedger.createMany({ data: [
      { entryGroup: `order:${order.id}:capture`, account: "BANK", direction: "DEBIT", amountPaise: order.totalPaise, referenceType: "MARKETPLACE_ORDER", referenceId: order.id, description: `Marketplace order ${order.code}`, idempotencyKey: `order:${order.id}:capture:0`, createdAt: order.paidAt! },
      { entryGroup: `order:${order.id}:capture`, account: "MARKETPLACE_REVENUE", direction: "CREDIT", amountPaise: order.totalPaise, referenceType: "MARKETPLACE_ORDER", referenceId: order.id, description: `Marketplace order ${order.code}`, idempotencyKey: `order:${order.id}:capture:1`, createdAt: order.paidAt! },
    ] });
    await db.review.create({ data: { productId: sold.id, userId: rahul.id, orderId: order.id, rating: 5, title: "Looks new", body: "Packed neatly, fabric is soft and there was no smell at all. Will buy pre-loved again." } });
  }
  await db.wishlistItem.create({ data: { userId: ananya.id, productId: products[0].id } });

  // ── B2B listings & purchase orders ──
  console.log("Creating B2B, recycling and finance…");
  const standardBin = bins.get(`BLR-HUB-01:STANDARD_REUSABLE:${[...bins.keys()].find((k) => k.startsWith("BLR-HUB-01:STANDARD_REUSABLE"))?.split(":")[2]}`);
  const binItems = await db.inventoryItem.findMany({ where: { batchId: null, kind: "LOT", warehouseId: warehouses["BLR-HUB-01"].id }, orderBy: { weightGrams: "desc" } });
  const largest = (grade: SortGrade) => binItems.find((b) => b.grade === grade);
  const stdLot = largest("STANDARD_REUSABLE") ?? (standardBin ? await db.inventoryItem.findUnique({ where: { id: standardBin } }) : null);
  const recLot = largest("RECYCLABLE");
  const upLot = largest("UPCYCLING");
  const repLot = largest("REPAIRABLE");
  const listings = [];
  if (stdLot) listings.push(await db.businessListing.create({ data: { code: humanCode("BL"), title: "Grade-A mixed reusable apparel (bales)", description: "Hand-sorted, wearable everyday apparel. Pressed into 50 kg bales. Ideal for thrift retail.", categoryId: stdLot.categoryId, grade: "STANDARD_REUSABLE", inventoryItemId: stdLot.id, availableGrams: Math.floor(stdLot.weightGrams * 0.8), pricePerKgPaise: 6500, minOrderGrams: 25_000, allowedTypes: ["THRIFT_STORE", "WHOLESALER", "NGO"], photoUrls: [productPhotos.sweaters[0]], createdById: admin.id } }));
  if (recLot) listings.push(await db.businessListing.create({ data: { code: humanCode("BL"), title: "Post-consumer cotton-rich recyclables", description: "Non-wearable cotton-rich garments, buttons and zips intact. Suitable for mechanical recycling.", categoryId: recLot.categoryId, grade: "RECYCLABLE", inventoryItemId: recLot.id, availableGrams: Math.floor(recLot.weightGrams * 0.5), pricePerKgPaise: 1200, minOrderGrams: 50_000, allowedTypes: ["TEXTILE_RECYCLER", "GARMENT_MANUFACTURER"], photoUrls: [productPhotos.denim[1]], createdById: admin.id } }));
  if (upLot) listings.push(await db.businessListing.create({ data: { code: humanCode("BL"), title: "Denim & printed cotton for upcycling", description: "Clean fabric panels and garments selected for bags, quilts and patchwork.", categoryId: upLot.categoryId, grade: "UPCYCLING", inventoryItemId: upLot.id, availableGrams: upLot.weightGrams, pricePerKgPaise: 2500, minOrderGrams: 10_000, allowedTypes: ["UPCYCLER", "NGO", "GARMENT_MANUFACTURER"], photoUrls: [productPhotos.embroidered[0]], createdById: admin.id } }));
  if (repLot) listings.push(await db.businessListing.create({ data: { code: humanCode("BL"), title: "Repairable garments — minor defects", description: "Missing buttons, small tears, broken zips. Great for repair-and-resell programmes.", categoryId: repLot.categoryId, grade: "REPAIRABLE", inventoryItemId: repLot.id, availableGrams: repLot.weightGrams, pricePerKgPaise: 3500, minOrderGrams: 10_000, allowedTypes: [], photoUrls: [productPhotos.flannel[0]], createdById: admin.id } }));
  if (listings[0]) {
    const l = listings[0];
    const delivered = await db.purchaseOrder.create({
      data: { code: humanCode("PR"), businessId: thrift.id, listingId: l.id, requestedGrams: 100_000, listPricePerKgPaise: 6175, agreedPricePerKgPaise: 6000, totalPaise: 600_000, status: "DELIVERED", invoiceNumber: "RW/B2B/2026-27/00001", deliveryAddress: "12 Commercial Street, Bengaluru 560001", courier: "ReWear Fleet", trackingNumber: "RWF-0091", confirmedAt: new Date(now.getTime() - 25 * DAY), dispatchedAt: new Date(now.getTime() - 23 * DAY), deliveredAt: new Date(now.getTime() - 22 * DAY), paymentStatus: "CAPTURED", createdAt: new Date(now.getTime() - 27 * DAY),
        offers: { create: [
          { byRole: "BUYER", actorId: b2bUser.id, pricePerKgPaise: 5500, grams: 100_000, message: "Regular monthly buyer — can you do ₹55/kg?", createdAt: new Date(now.getTime() - 27 * DAY) },
          { byRole: "REWEAR", actorId: admin.id, pricePerKgPaise: 6000, grams: 100_000, message: "₹60/kg for 100 kg, delivered.", createdAt: new Date(now.getTime() - 26 * DAY) },
        ] } },
    });
    await db.inventoryItem.update({ where: { id: l.inventoryItemId! }, data: { weightGrams: { decrement: 100_000 } } }).catch(() => null);
    await db.inventoryMovement.create({ data: { itemId: l.inventoryItemId!, type: "DISPATCH", deltaGrams: -100_000, actorId: admin.id, referenceType: "PURCHASE_ORDER", referenceId: delivered.id, createdAt: delivered.dispatchedAt! } });
    await db.financialLedger.createMany({ data: [
      { entryGroup: `po:${delivered.id}:payment`, account: "BANK", direction: "DEBIT", amountPaise: 600_000, referenceType: "PURCHASE_ORDER", referenceId: delivered.id, description: "B2B invoice RW/B2B/2026-27/00001 paid", idempotencyKey: `po:${delivered.id}:payment:0`, createdAt: delivered.deliveredAt! },
      { entryGroup: `po:${delivered.id}:payment`, account: "B2B_REVENUE", direction: "CREDIT", amountPaise: 600_000, referenceType: "PURCHASE_ORDER", referenceId: delivered.id, description: "B2B invoice RW/B2B/2026-27/00001 paid", idempotencyKey: `po:${delivered.id}:payment:1`, createdAt: delivered.deliveredAt! },
    ] });
    await db.purchaseOrder.create({
      data: { code: humanCode("PR"), businessId: thrift.id, listingId: l.id, requestedGrams: 50_000, listPricePerKgPaise: 6175, status: "NEGOTIATING", deliveryAddress: "12 Commercial Street, Bengaluru 560001",
        offers: { create: [{ byRole: "BUYER", actorId: b2bUser.id, pricePerKgPaise: 5800, grams: 50_000, message: "Need 50 kg before Christmas sale." }] } },
    });
  }

  // ── Recycling dispatch (settled) from a dedicated recyclable lot ──
  {
    const lot = await db.inventoryItem.create({ data: { code: `REC-${randomCode(8)}`, kind: "LOT", grade: "RECYCLABLE", categoryId: catBySlug.get("other-textiles")!.id, warehouseId: warehouses["BLR-HUB-01"].id, weightGrams: 0, status: "DISPATCHED", title: "Recyclable bale lot — October" } });
    await db.inventoryMovement.create({ data: { itemId: lot.id, type: "SORT_IN", deltaGrams: 320_000, actorId: warehouseMgr.id, reason: "Consolidated recyclable bales", createdAt: new Date(now.getTime() - 35 * DAY) } });
    const d = await db.recyclerDispatch.create({ data: { code: humanCode("RD"), partnerId: recycler.id, warehouseId: warehouses["BLR-HUB-01"].id, itemIds: [lot.id], dispatchedGrams: 320_000, receivedGrams: 318_400, ratePerKgPaise: 900, settlementPaise: 286_560, status: "SETTLED", vehicleNumber: "KA-51-AB-9921", dispatchedAt: new Date(now.getTime() - 33 * DAY), deliveredAt: new Date(now.getTime() - 32 * DAY), settledAt: new Date(now.getTime() - 25 * DAY), settlementRef: "NEFT-GLTR-77812", createdById: warehouseMgr.id } });
    await db.inventoryMovement.create({ data: { itemId: lot.id, type: "DISPATCH", deltaGrams: -320_000, actorId: warehouseMgr.id, referenceType: "RECYCLER_DISPATCH", referenceId: d.id, createdAt: d.dispatchedAt! } });
    await db.financialLedger.createMany({ data: [
      { entryGroup: `recycler:${d.id}:settle`, account: "BANK", direction: "DEBIT", amountPaise: 286_560, referenceType: "RECYCLER_DISPATCH", referenceId: d.id, description: `Recycler settlement ${d.code}`, idempotencyKey: `recycler:${d.id}:settle:0`, createdAt: d.settledAt! },
      { entryGroup: `recycler:${d.id}:settle`, account: "RECYCLING_REVENUE", direction: "CREDIT", amountPaise: 286_560, referenceType: "RECYCLER_DISPATCH", referenceId: d.id, description: `Recycler settlement ${d.code}`, idempotencyKey: `recycler:${d.id}:settle:1`, createdAt: d.settledAt! },
    ] });
  }

  // ── Internal operating costs (never charged to customers) ──
  for (let m = 2; m >= 0; m--) {
    for (const [account, amount, desc] of [["LOGISTICS_COST", 18_500_00, "Fleet fuel & driver wages"], ["SORTING_COST", 9_200_00, "Sorting team wages"], ["PROCESSING_COST", 4_100_00, "Laundry, baling & packaging"]] as const) {
      const date = new Date(now.getTime() - (m * 30 + 2) * DAY);
      const c = await db.operatingCost.create({ data: { account, amountPaise: amount, costDate: new Date(date.toISOString().slice(0, 10)), city: "Bengaluru", description: desc, createdById: admin.id, createdAt: date } });
      await db.financialLedger.createMany({ data: [
        { entryGroup: `cost:${c.id}`, account, direction: "DEBIT", amountPaise: amount, referenceType: "COST", referenceId: c.id, description: desc, idempotencyKey: `cost:${c.id}:0`, createdAt: date },
        { entryGroup: `cost:${c.id}`, account: "BANK", direction: "CREDIT", amountPaise: amount, referenceType: "COST", referenceId: c.id, description: desc, idempotencyKey: `cost:${c.id}:1`, createdAt: date },
      ] });
    }
  }

  // ── Support & notifications ──
  await db.supportTicket.create({ data: { code: humanCode("TK"), userId: rahul.id, type: "PAYMENT", subject: "How do I add my UPI ID?", messages: { create: { authorId: rahul.id, body: "I booked a pickup but haven't added UPI yet. Will I still get paid?" } } } });
  await db.notification.createMany({ data: [
    { userId: ananya.id, title: "Approve your valuation", body: "Your clothes were weighed at the doorstep. Review and approve to get paid.", link: "/app/bookings" },
    { userId: ananya.id, title: "Referral reward earned", body: "You earned 100 ReWear points — thanks for spreading the word!", link: "/app/rewards", readAt: new Date() },
  ] });
  await db.rewardTransaction.create({ data: { userId: ananya.id, type: "REFERRAL_REFERRER", points: 100, description: "Your friend completed their first pickup", idempotencyKey: "seed:referral:ananya" } });
  await db.customerProfile.update({ where: { userId: ananya.id }, data: { rewardPoints: { increment: 100 } } });

  await db.auditLog.create({ data: { actorId: superAdmin.id, actorRole: "SUPER_ADMIN", action: "seed.run", entityType: "System", after: { bookings: bookingCount } } });

  console.log("\nDemo accounts (OTP 123456 in development):");
  console.table([
    ["Customer", "9000000001", "Ananya Rao"],
    ["Customer (no UPI yet)", "9000000002", "Rahul Mehta"],
    ["Pickup Executive", "9000000003", "Suresh Kumar"],
    ["Warehouse Manager", "9000000004", "Lakshmi Narayan"],
    ["Admin", "9000000005", "Priya Sharma"],
    ["Super Admin", "9000000006", "Vikram Iyer"],
    ["B2B Buyer (verified)", "9000000007", "Second Chance Thrift"],
    ["Recycler Partner", "9000000008", "GreenLoop Textile Recyclers"],
    ["Donation Partner", "9000000009", "Vastra Seva Foundation"],
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
