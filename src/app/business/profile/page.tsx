import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, KeyValue, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { businessTypeLabel, verificationStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Business profile" };

export default async function BusinessProfilePage() {
  const user = await requireRole(["B2B_BUYER"]);
  const b = await db.businessProfile.findUnique({ where: { userId: user.id } });
  if (!b) redirect("/partners/register?type=business");
  return (
    <>
      <PageHeader title="Business profile" description="Contact support to change verified details." actions={<StatusBadge map={verificationStatus} value={b.verificationStatus} />} />
      <Card className="max-w-2xl p-5">
        <KeyValue items={[["Legal name", b.legalName], ["Trade name", b.tradeName ?? "—"], ["Type", businessTypeLabel[b.businessType]], ["GSTIN", b.gstin ?? "—"], ["PAN", b.pan ?? "—"], ["Email", b.contactEmail ?? "—"], ["Phone", b.contactPhone ?? user.phone ?? "—"], ["Address", `${b.addressLine}, ${b.city}, ${b.state} ${b.pincode}`], ["Pricing tier", `${b.priceTier} (${b.discountBps / 100}% off list)`], ["Verified on", formatDate(b.verifiedAt)]]} />
      </Card>
    </>
  );
}
