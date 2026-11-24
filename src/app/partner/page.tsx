import Link from "next/link";
import { HandHeart, Package, Scale } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { acknowledgeDonationAction } from "@/app/actions/partners";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, EmptyState, Notice, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { donationStatus } from "@/lib/labels";
import { formatDate, formatKg } from "@/lib/utils";

export const metadata = { title: "Donations" };

export default async function PartnerHome() {
  const user = await requireRole(["DONATION_PARTNER"]);
  const partner = await db.donationPartner.findUnique({ where: { userId: user.id }, include: { donations: { include: { booking: true, donor: { select: { name: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!partner) return <Notice tone="danger" title="No NGO profile linked">Ask ReWear to link your login to your organisation.</Notice>;
  const toAck = partner.donations.filter((d) => d.status === "HANDED_OVER");
  return (
    <>
      <PageHeader title={partner.name} description={`${partner.city} · ${partner.focusAreas.join(", ")}${partner.has80G ? " · 80G" : ""}`} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Clothes received" value={formatKg(partner.donations.filter((d) => ["HANDED_OVER", "ACKNOWLEDGED"].includes(d.status)).reduce((s, d) => s + (d.collectedGrams ?? 0), 0), 0)} icon={Scale} tone="forest" />
        <Stat label="To acknowledge" value={toAck.length} icon={HandHeart} />
        <Stat label="Upcoming" value={partner.donations.filter((d) => ["BOOKED", "COLLECTED"].includes(d.status)).length} icon={Package} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Donations" description="Acknowledge receipt with a short thank-you — donors see it with their receipt." />
        {partner.donations.length === 0 ? <div className="p-5"><EmptyState icon={HandHeart} title="No donations yet" /></div> : (
          <Table>
            <thead><tr><Th>Donation</Th><Th>Donor</Th><Th className="text-right">Weight</Th><Th>Receipt</Th><Th>Status</Th><Th>Acknowledgement</Th></tr></thead>
            <tbody>
              {partner.donations.map((d) => (
                <tr key={d.id}>
                  <Td><div className="num font-medium">{d.code}</div><div className="text-xs text-muted">{formatDate(d.createdAt)}</div></Td>
                  <Td className="text-sm">{d.donor.name?.split(" ")[0]}</Td>
                  <Td className="num text-right">{d.collectedGrams ? formatKg(d.collectedGrams) : "—"}</Td>
                  <Td className="num text-xs">{d.receiptNumber ? <Link href={`/receipts/donation/${d.code}`} className="text-forest underline">{d.receiptNumber}</Link> : "—"}</Td>
                  <Td><StatusBadge map={donationStatus} value={d.status} /></Td>
                  <Td>
                    {d.status === "HANDED_OVER" ? (
                      <ActionForm action={acknowledgeDonationAction} className="flex gap-1"><input type="hidden" name="donationId" value={d.id} /><Input name="note" placeholder="Thank-you note" className="h-8 text-xs" /><SubmitButton size="sm">Acknowledge</SubmitButton></ActionForm>
                    ) : <span className="text-xs text-muted">{d.acknowledgement ?? "—"}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
