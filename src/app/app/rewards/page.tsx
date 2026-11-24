import { Gift, Leaf, Share2, Users } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { impactFromGrams } from "@/server/services/analytics";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/primitives";
import { CopyButton } from "@/components/copy-button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Rewards & impact" };

export default async function RewardsPage() {
  const user = await requireRole(["CUSTOMER"]);
  const [profile, txns, referrals, cfg, grams] = await Promise.all([
    db.customerProfile.findUnique({ where: { userId: user.id } }),
    db.rewardTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.referral.findMany({ where: { referrerId: user.id }, include: { referee: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    getSetting("rewards"),
    db.$queryRaw<{ g: bigint }[]>`SELECT COALESCE(SUM(w."netGrams" - w."rejectedGrams"),0)::bigint g FROM "Booking" b JOIN LATERAL (SELECT * FROM "WeighingRecord" wr WHERE wr."bookingId"=b.id ORDER BY wr."createdAt" DESC LIMIT 1) w ON true WHERE b."customerId"=${user.id} AND b.status='COMPLETED'`,
  ]);
  const impact = impactFromGrams(Number(grams[0]?.g ?? 0));
  const link = `${process.env.APP_URL ?? ""}/onboarding?ref=${profile?.referralCode}`;
  return (
    <>
      <PageHeader title="Rewards & impact" description="Loyalty points for every kilogram and every friend you bring. Points have no cash value." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ReWear points" value={profile?.rewardPoints ?? 0} icon={Gift} tone="forest" />
        <Stat label="Friends referred" value={referrals.length} hint={`${referrals.filter((r) => r.status === "QUALIFIED").length} qualified`} icon={Users} />
        <Stat label="Clothes diverted" value={`${impact.kg.toFixed(1)} kg`} icon={Leaf} />
        <Stat label="CO₂e avoided (est.)" value={`${Math.round(impact.co2Kg)} kg`} icon={Leaf} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2 font-semibold"><Share2 className="size-4 text-forest" /> Invite friends</div>
          <p className="mt-2 text-sm text-muted">They get {cfg.refereePoints} points and you get {cfg.referrerPoints} points when they complete their first pickup.</p>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-cream p-4">
            <div><div className="text-xs text-muted">Your code</div><div className="num font-display text-2xl font-bold tracking-wider">{profile?.referralCode}</div></div>
            <CopyButton value={link} label="Copy invite link" />
          </div>
          <ul className="mt-4 divide-y divide-line text-sm">
            {referrals.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.referee.name ?? "New member"}</span><span className={r.status === "QUALIFIED" ? "text-forest" : "text-muted"}>{r.status === "QUALIFIED" ? "Qualified" : "Awaiting first pickup"}</span></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Points history" />
          <ul className="divide-y divide-line">
            {txns.length === 0 && <li className="px-5 py-6 text-sm text-muted">Earn {cfg.pointsPerKg} points for every kilogram you sell or donate.</li>}
            {txns.map((t) => <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm"><div><div>{t.description}</div><div className="text-xs text-muted">{formatDate(t.createdAt)}</div></div><span className={`num font-semibold ${t.points > 0 ? "text-forest" : "text-danger"}`}>{t.points > 0 ? "+" : ""}{t.points}</span></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
