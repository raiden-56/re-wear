import { describe, expect, it } from "vitest";
import { assertDeductionAllowed, assertFreePickup, checkMinimumQuantity, PICKUP_FEE_PAISE } from "@/server/domain/pickup-policy";
import { computeNetGrams, reconcileCategoryWeights, variancePercent } from "@/server/domain/weighing";
import { buildValuation, estimate, lineAmountPaise, splitEvenly } from "@/server/domain/valuation";
import { isRuleLive, selectRule, type RuleCandidate } from "@/server/domain/pricing";
import { assertTransition, BOOKING_TRANSITIONS, canTransition, PAYOUT_INITIABLE, PAYOUT_TRANSITIONS } from "@/server/domain/state";
import { pickCollector } from "@/server/services/assignment";
import { canAccessPortal, hasPermission, ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { normalizePhone } from "@/server/auth/otp";
import { toCsv } from "@/server/services/reports";
import { detectImageType } from "@/server/providers/storage";

describe("free pickup policy", () => {
  it("pickup fee is a constant zero", () => {
    expect(PICKUP_FEE_PAISE).toBe(0);
    expect(() => assertFreePickup({ pickupFeePaise: 0 })).not.toThrow();
    expect(() => assertFreePickup({})).not.toThrow();
  });
  it("rejects any non-zero pickup fee", () => {
    expect(() => assertFreePickup({ pickupFeePaise: 1 })).toThrow(/free/i);
    expect(() => assertFreePickup({ pickupFeePaise: 4900 })).toThrow();
  });
  it("never allows pickup/convenience charges as deductions, even when deductions are enabled", () => {
    const policy = { deductionsAllowed: true, allowedReasons: ["Pickup fee", "Wet clothing"] };
    expect(() => assertDeductionAllowed("Pickup fee", policy)).toThrow(/never be deducted/);
    expect(() => assertDeductionAllowed("Convenience charge", policy)).toThrow();
    expect(() => assertDeductionAllowed("Logistics fee", policy)).toThrow();
    expect(() => assertDeductionAllowed("Wet clothing", policy)).not.toThrow();
  });
  it("deductions are blocked when the published policy disallows them", () => {
    expect(() => assertDeductionAllowed("Wet clothing", { deductionsAllowed: false, allowedReasons: ["Wet clothing"] })).toThrow(/not permitted/);
  });
  it("has no minimum quantity by default; explicit policy only", () => {
    expect(() => checkMinimumQuantity(100, 0)).not.toThrow();
    expect(() => checkMinimumQuantity(2000, 5000)).toThrow(/free/);
    expect(() => checkMinimumQuantity(5000, 5000)).not.toThrow();
  });
});

describe("weight calculations", () => {
  it("net = gross − tare", () => {
    expect(computeNetGrams(12130, 650)).toBe(11480);
  });
  it("validates gross and tare", () => {
    expect(() => computeNetGrams(0, 0)).toThrow();
    expect(() => computeNetGrams(1000, -1)).toThrow();
    expect(() => computeNetGrams(1000, 1000)).toThrow(/less than gross/);
    expect(() => computeNetGrams(1000.5, 0)).toThrow(/whole grams/);
  });
  it("category weights + rejected must reconcile with net within tolerance", () => {
    const w = [{ categoryId: "a", grams: 4820 }, { categoryId: "b", grams: 6260 }];
    expect(reconcileCategoryWeights(11480, w, 400, 50)).toBe(0);
    expect(reconcileCategoryWeights(11480, w, 440, 50)).toBe(40);
    expect(() => reconcileCategoryWeights(11480, w, 0, 50)).toThrow(/add up/);
    expect(() => reconcileCategoryWeights(1000, [{ categoryId: "a", grams: 500 }, { categoryId: "a", grams: 500 }], 0)).toThrow(/once/);
    expect(() => reconcileCategoryWeights(1000, [], 1000)).toThrow();
  });
  it("variance percent", () => {
    expect(variancePercent(10000, 9500)).toBeCloseTo(-5);
    expect(variancePercent(0, 100)).toBe(0);
  });
});

describe("pricing calculations", () => {
  it("rounds line amounts to the nearest paisa", () => {
    expect(lineAmountPaise(4820, 2200)).toBe(10604); // 4.82 kg × ₹22 = ₹106.04
    expect(lineAmountPaise(3960, 1200)).toBe(4752);
    expect(lineAmountPaise(1, 1499)).toBe(1); // 1.499 paise → 1
    expect(lineAmountPaise(0, 1500)).toBe(0);
  });
  it("valuation totals and deductions", () => {
    const v = buildValuation([{ categoryId: "a", name: "Jeans", grams: 4820, ratePaisePerKg: 2200 }, { categoryId: "b", name: "Tees", grams: 3960, ratePaisePerKg: 1200 }]);
    expect(v.subtotalPaise).toBe(15356);
    expect(v.payablePaise).toBe(15356);
    const withDeduction = buildValuation([{ categoryId: "a", name: "Jeans", grams: 10000, ratePaisePerKg: 2000 }], [{ reason: "Wet clothing", amountPaise: 1000 }], { deductionsAllowed: true, allowedReasons: ["Wet clothing"], maxDeductionPct: 10 });
    expect(withDeduction.payablePaise).toBe(19000);
    expect(() => buildValuation([{ categoryId: "a", name: "J", grams: 1000, ratePaisePerKg: 1000 }], [{ reason: "Wet clothing", amountPaise: 500 }], { deductionsAllowed: true, allowedReasons: ["Wet clothing"], maxDeductionPct: 10 })).toThrow(/exceed/);
  });
  it("estimate uses identical arithmetic", () => {
    expect(estimate([{ categoryId: "a", name: "A", grams: 5000, ratePaisePerKg: 1400 }]).totalPaise).toBe(7000);
  });
  it("splits weight evenly to the gram", () => {
    const s = splitEvenly(10001, ["a", "b", "c"]);
    expect(s.reduce((x, y) => x + y.grams, 0)).toBe(10001);
    expect(s.map((x) => x.grams)).toEqual([3334, 3334, 3333]);
  });

  const base: RuleCandidate = { id: "g", categoryId: "c", channel: "KG_BUYBACK", condition: "ANY", serviceAreaId: null, city: null, pricePerKgPaise: 1400, effectiveFrom: new Date("2026-01-01"), effectiveTo: null, active: true, approvalStatus: "APPROVED" };
  const at = new Date("2026-06-01");
  it("prefers area > city > global, and exact condition over ANY", () => {
    const rules = [base, { ...base, id: "city", city: "Bengaluru", pricePerKgPaise: 1500 }, { ...base, id: "area", serviceAreaId: "sa1", pricePerKgPaise: 1600 }, { ...base, id: "cond", city: "Bengaluru", condition: "EXCELLENT", pricePerKgPaise: 1550 }];
    expect(selectRule(rules, { categoryId: "c", channel: "KG_BUYBACK", serviceAreaId: "sa1", city: "Bengaluru", at })?.id).toBe("area");
    expect(selectRule(rules, { categoryId: "c", channel: "KG_BUYBACK", serviceAreaId: "other", city: "bengaluru", at })?.id).toBe("city");
    expect(selectRule(rules, { categoryId: "c", channel: "KG_BUYBACK", city: "Bengaluru", condition: "EXCELLENT", at })?.id).toBe("cond");
    expect(selectRule(rules, { categoryId: "c", channel: "KG_BUYBACK", city: "Pune", at })?.id).toBe("g");
  });
  it("ignores unapproved, inactive, future and expired rules", () => {
    expect(isRuleLive({ ...base, approvalStatus: "PENDING" }, at)).toBe(false);
    expect(isRuleLive({ ...base, active: false }, at)).toBe(false);
    expect(isRuleLive({ ...base, effectiveFrom: new Date("2026-07-01") }, at)).toBe(false);
    expect(isRuleLive({ ...base, effectiveTo: new Date("2026-05-01") }, at)).toBe(false);
    expect(selectRule([{ ...base, approvalStatus: "PENDING" }], { categoryId: "c", channel: "KG_BUYBACK", at })).toBeNull();
  });
  it("picks the newest of equally specific rules", () => {
    const newer = { ...base, id: "new", effectiveFrom: new Date("2026-05-01"), pricePerKgPaise: 1800 };
    expect(selectRule([base, newer], { categoryId: "c", channel: "KG_BUYBACK", at })?.id).toBe("new");
  });
});

describe("collector assignment policy", () => {
  it("picks the least-loaded collector with spare capacity", () => {
    expect(pickCollector([{ id: 1, load: 5, free: 7 }, { id: 2, load: 2, free: 10 }, { id: 3, load: 2, free: 1 }])?.id).toBe(2);
  });
  it("skips collectors at capacity and returns null when everyone is full", () => {
    expect(pickCollector([{ id: 1, load: 0, free: 0 }, { id: 2, load: 9, free: 3 }])?.id).toBe(2);
    expect(pickCollector([{ id: 1, load: 12, free: 0 }])).toBeNull();
  });
});

describe("state machines", () => {
  it("bookings follow the pickup lifecycle", () => {
    expect(canTransition(BOOKING_TRANSITIONS, "SCHEDULED", "ASSIGNED")).toBe(true);
    expect(canTransition(BOOKING_TRANSITIONS, "SCHEDULED", "COMPLETED")).toBe(false);
    expect(canTransition(BOOKING_TRANSITIONS, "AWAITING_APPROVAL", "APPROVED")).toBe(true);
    expect(() => assertTransition(BOOKING_TRANSITIONS, "CANCELLED", "ASSIGNED")).toThrow();
  });
  it("payouts can only be (re)sent from approved, failed or reversed", () => {
    expect(PAYOUT_INITIABLE).toEqual(["APPROVED", "FAILED", "REVERSED"]);
    expect(canTransition(PAYOUT_TRANSITIONS, "AWAITING_APPROVAL", "INITIATED")).toBe(false);
    expect(canTransition(PAYOUT_TRANSITIONS, "PROCESSING", "INITIATED")).toBe(false);
    expect(canTransition(PAYOUT_TRANSITIONS, "INITIATED", "SUCCESSFUL")).toBe(true);
    expect(canTransition(PAYOUT_TRANSITIONS, "SUCCESSFUL", "FAILED")).toBe(false);
  });
});

describe("role permissions", () => {
  it("customers book and respond to valuations but cannot run operations", () => {
    expect(hasPermission("CUSTOMER", "booking:create")).toBe(true);
    expect(hasPermission("CUSTOMER", "valuation:respond")).toBe(true);
    expect(hasPermission("CUSTOMER", "payout:approve")).toBe(false);
    expect(hasPermission("CUSTOMER", "pricing:manage")).toBe(false);
  });
  it("collectors cannot change rates or payouts", () => {
    for (const p of ["pricing:manage", "pricing:approve", "payout:approve", "payout:initiate", "valuation:revise"] as const) expect(hasPermission("COLLECTOR", p)).toBe(false);
    expect(hasPermission("COLLECTOR", "weighing:record")).toBe(true);
  });
  it("only super admins manage staff roles", () => {
    expect(hasPermission("ADMIN", "users:manage")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "users:manage")).toBe(true);
  });
  it("every role has permissions and portals are isolated", () => {
    for (const r of Object.keys(ROLE_PERMISSIONS)) expect(ROLE_PERMISSIONS[r as keyof typeof ROLE_PERMISSIONS].length).toBeGreaterThan(0);
    expect(canAccessPortal("CUSTOMER", "/admin")).toBe(false);
    expect(canAccessPortal("COLLECTOR", "/collector/pickups/x")).toBe(true);
    expect(canAccessPortal("B2B_BUYER", "/warehouse")).toBe(false);
    expect(canAccessPortal("WAREHOUSE_MANAGER", "/warehouse/inventory")).toBe(true);
    expect(canAccessPortal("CUSTOMER", "/shop")).toBe(true);
  });
});

describe("helpers", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(() => normalizePhone("12345")).toThrow();
    expect(() => normalizePhone("5876543210")).toThrow();
  });
  it("CSV export escapes and neutralises formula injection", () => {
    const csv = toCsv([{ a: "=HYPERLINK(1)", b: 'say "hi", ok', c: 3 }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"say ""hi"", ok"');
  });
  it("detects real image types from magic bytes", () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe("image/jpeg");
    expect(detectImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});
