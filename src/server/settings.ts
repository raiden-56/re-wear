import { db, type DbOrTx } from "./db";

/** Published, configurable business policies. Free pickup is NOT configurable. */
export const SETTING_DEFAULTS = {
  branding: {
    name: "ReWear",
    tagline: "Clear your wardrobe. Earn from every KG.",
    supportPhone: "+91 80 4718 2290",
    supportEmail: "care@rewear.example",
    whatsapp: "+91 80 4718 2290",
    address: "ReWear Circular Hub, Plot 14, KIADB Industrial Area, Bengaluru 560099",
  },
  pickup: {
    bookingWindowDays: 14,
    sameDayCutoffHours: 2,
  },
  valuation: {
    deductionsAllowed: false,
    allowedDeductionReasons: ["Wet or damp clothing (weight correction)"],
    maxDeductionPct: 10,
    weightToleranceGrams: 50,
    rejectionFlow: "DISPUTE" as "DISPUTE" | "RETURN",
    reinspectionVariancePct: 5,
  },
  payouts: {
    autoApproveLimitPaise: 150000, // ₹1,500 — larger payouts need an admin
    maxAttempts: 5,
  },
  rewards: {
    referrerPoints: 100,
    refereePoints: 50,
    pointsPerKg: 2,
  },
  marketplace: {
    reservationMinutes: 15,
    shippingFlatPaise: 4900,
    freeShippingAbovePaise: 99900,
  },
  integrations: {
    aiClassification: false,
  },
  /** Only real customers who gave written consent, tied to a completed booking. */
  testimonials: {
    items: [] as { name: string; city: string; quote: string; bookingCode: string; consentDate: string }[],
  },
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

export async function getSetting<K extends SettingKey>(key: K, client: DbOrTx = db): Promise<Settings[K]> {
  const row = await client.appSetting.findUnique({ where: { key } });
  return { ...SETTING_DEFAULTS[key], ...((row?.value as object) ?? {}) } as Settings[K];
}

export async function getAllSettings(): Promise<Settings> {
  const rows = await db.appSetting.findMany();
  const out = structuredClone(SETTING_DEFAULTS) as Record<string, unknown>;
  for (const r of rows) if (r.key in out) out[r.key] = { ...(out[r.key] as object), ...(r.value as object) };
  return out as Settings;
}
