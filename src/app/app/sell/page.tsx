import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { rateCard } from "@/server/services/pricing";
import { getSetting } from "@/server/settings";
import { SellWizard } from "@/components/customer/sell-wizard";
import { addDays, dayOfWeek, todayIST } from "@/lib/dates";

export const metadata = { title: "Sell clothes" };

export default async function SellPage() {
  const user = await requireRole(["CUSTOMER"], "/app/sell");
  const [kg, premium, recycling, addresses, partners, pickup] = await Promise.all([
    rateCard("KG_BUYBACK"),
    rateCard("PREMIUM_RESALE"),
    rateCard("RECYCLING"),
    db.address.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    db.donationPartner.findMany({ where: { active: true, verificationStatus: "VERIFIED" }, orderBy: { name: "asc" } }),
    getSetting("pickup"),
  ]);
  const map = (rows: Awaited<ReturnType<typeof rateCard>>) => rows.filter((r) => r.accepted).map((r) => ({ id: r.id, slug: r.slug, name: r.name, imageUrl: r.imageUrl, rate: r.ratePaisePerKg }));
  const today = todayIST();
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = Array.from({ length: pickup.bookingWindowDays + 1 }, (_, i) => {
    const d = addDays(today, i);
    return { value: d, label: String(Number(d.slice(8))) + " " + new Date(d + "T00:00:00Z").toLocaleString("en-IN", { month: "short", timeZone: "UTC" }), sub: i === 0 ? "Today" : i === 1 ? "Tmrw" : names[dayOfWeek(d)] };
  });
  return (
    <SellWizard
      catalog={{ KG_BUYBACK: map(kg), PREMIUM_RESALE: map(premium), RECYCLING: map(recycling), DONATION: map(kg).map((c) => ({ ...c, rate: 0 })) }}
      addresses={addresses.map((a) => ({ id: a.id, label: a.label, line1: a.line1, line2: a.line2, city: a.city, pincode: a.pincode, serviceable: !!a.serviceAreaId, isDefault: a.isDefault }))}
      partners={partners.map((p) => ({ id: p.id, name: p.name, city: p.city, description: p.description, has80G: p.has80G, focusAreas: p.focusAreas }))}
      days={days}
    />
  );
}
