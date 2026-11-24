import { redirect } from "next/navigation";
import { IndianRupee, Recycle, Scale, Truck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { recyclerReceiptAction } from "@/app/actions/partners";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, Notice, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { dispatchStatus, gradeLabel, verificationStatus } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function RecyclerHome() {
  const user = await requireRole(["RECYCLER_PARTNER"]);
  const partner = await db.recyclerPartner.findUnique({ where: { userId: user.id }, include: { dispatches: { orderBy: { createdAt: "desc" } } } });
  if (!partner) redirect("/partners/register?type=recycler");
  const available = await db.inventoryItem.groupBy({ by: ["grade"], where: { grade: { in: ["RECYCLABLE", "UPCYCLING"] }, status: "IN_STOCK", kind: "LOT" }, _sum: { weightGrams: true } });
  const settled = partner.dispatches.filter((d) => d.status === "SETTLED");
  return (
    <>
      <PageHeader title={partner.name} description={`${partner.city} · licence ${partner.licenseNumber ?? "—"}`} actions={<StatusBadge map={verificationStatus} value={partner.verificationStatus} />} />
      {partner.verificationStatus !== "VERIFIED" && <Notice tone="warn" className="mb-5">Dispatches start once your licences are verified by ReWear.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received (all time)" value={formatKg(partner.dispatches.reduce((s, d) => s + (d.receivedGrams ?? 0), 0), 0)} icon={Scale} tone="forest" />
        <Stat label="Settled" value={formatINR(settled.reduce((s, d) => s + (d.settlementPaise ?? 0), 0), { whole: true })} icon={IndianRupee} />
        <Stat label="In transit" value={partner.dispatches.filter((d) => d.status === "DISPATCHED").length} icon={Truck} />
        <Stat label="Your rate" value={`${formatINR(partner.ratePerKgPaise)}/kg`} icon={Recycle} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Dispatches" description="Confirm received weight on arrival; settlement follows." />
          <Table>
            <thead><tr><Th>Dispatch</Th><Th className="text-right">Sent</Th><Th className="text-right">Received</Th><Th className="text-right">Settlement</Th><Th>Status</Th></tr></thead>
            <tbody>
              {partner.dispatches.map((d) => (
                <tr key={d.id}>
                  <Td><div className="num font-medium">{d.code}</div><div className="text-xs text-muted">{formatDate(d.dispatchedAt)} · {d.vehicleNumber}</div></Td>
                  <Td className="num text-right">{formatKg(d.dispatchedGrams, 1)}</Td>
                  <Td className="text-right">
                    {d.status === "DISPATCHED" ? (
                      <ActionForm action={recyclerReceiptAction} className="flex justify-end gap-1"><input type="hidden" name="dispatchId" value={d.id} /><Input name="receivedKg" type="number" step="0.1" defaultValue={d.dispatchedGrams / 1000} className="num h-8 w-24 text-xs" aria-label="Received kg" /><SubmitButton size="sm">Confirm</SubmitButton></ActionForm>
                    ) : <span className="num">{d.receivedGrams !== null ? formatKg(d.receivedGrams, 1) : "—"}</span>}
                  </Td>
                  <Td className="num text-right">{d.settlementPaise ? formatINR(d.settlementPaise) : "—"}{d.settlementRef && <div className="text-xs text-muted">{d.settlementRef}</div>}</Td>
                  <Td><StatusBadge map={dispatchStatus} value={d.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Material available at ReWear" description="Ask your account manager to schedule a dispatch." />
          <ul className="divide-y divide-line">{available.map((a) => <li key={a.grade} className="flex justify-between px-5 py-3 text-sm"><span>{gradeLabel[a.grade].label}</span><span className="num font-semibold">{formatKg(a._sum.weightGrams, 0)}</span></li>)}</ul>
          <p className="px-5 pb-4 text-xs text-muted">Accepted materials on file: {partner.materialsAccepted.join(", ")}</p>
        </Card>
      </div>
    </>
  );
}
