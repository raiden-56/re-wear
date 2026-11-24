import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/guard";
import { db } from "@/server/db";
import { formatDate, formatKg } from "@/lib/utils";

export const metadata = { title: "Donation receipt" };

export default async function DonationReceipt({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const { code } = await params;
  const d = await db.donation.findUnique({ where: { code }, include: { partner: true, donor: true, booking: true } });
  if (!d || (d.donorId !== user.id && d.partner.userId !== user.id && !can(user, "donation:manage"))) notFound();
  return (
    <div className="mt-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Donation receipt</h1>
        <p className="num text-sm text-muted">{d.receiptNumber ?? "Receipt pending hand-over"} · {d.code}</p>
      </div>
      <p className="leading-relaxed">
        This acknowledges that <strong>{d.donor.name}</strong> donated <strong>{d.collectedGrams ? formatKg(d.collectedGrams) : "clothing"}</strong> of clothing (booking {d.booking.code}), collected free of charge by ReWear on {formatDate(d.booking.completedAt)} and handed over to <strong>{d.partner.name}</strong>
        {d.partner.registrationNo ? ` (Reg. ${d.partner.registrationNo})` : ""} on {formatDate(d.handedOverAt)}.
      </p>
      {d.acknowledgement && <blockquote className="rounded-2xl bg-cream p-4 italic">“{d.acknowledgement}” — {d.partner.name}, {formatDate(d.acknowledgedAt)}</blockquote>}
      <p className="text-xs text-muted">This is an in-kind donation of used clothing; no payment was made to the donor. {d.partner.has80G ? "For 80G certificates, contact the NGO directly with this receipt number." : "This partner does not issue 80G certificates."} Donations are recorded separately from ReWear's commercial sales.</p>
    </div>
  );
}
