import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { handoverDonationAction, recyclerDispatchAction, settleDispatchAction } from "@/app/actions/warehouse";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { dispatchStatus, donationStatus, gradeLabel } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const user = await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const [lots, partners, dispatches, donations] = await Promise.all([
    db.inventoryItem.findMany({ where: { kind: "LOT", grade: { in: ["RECYCLABLE", "UPCYCLING", "REJECTED"] }, weightGrams: { gt: 0 }, status: { in: ["IN_STOCK", "SCRAPPED"] }, listingLinks: { none: { active: true } } }, include: { warehouse: true, category: true }, orderBy: { weightGrams: "desc" }, take: 40 }),
    db.recyclerPartner.findMany({ where: { verificationStatus: "VERIFIED" } }),
    db.recyclerDispatch.findMany({ include: { partner: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.donation.findMany({ where: { status: { in: ["COLLECTED", "HANDED_OVER"] } }, include: { partner: true, booking: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role);
  return (
    <>
      <PageHeader title="Dispatch" description="Recycler dispatches and NGO donation hand-overs. Donations are tracked separately from sales." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="New recycler dispatch" description="Select lots from one warehouse." />
          <ActionForm action={recyclerDispatchAction} className="space-y-4 p-5">
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-line p-3">
              {lots.length === 0 && <p className="text-sm text-muted">No recyclable lots available.</p>}
              {lots.map((l) => <Checkbox key={l.id} name="itemIds" value={l.id} label={<span className="num">{l.code} · {gradeLabel[l.grade].label} · {l.category.name} · <strong>{formatKg(l.weightGrams)}</strong> · {l.warehouse.code}</span>} />)}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Recycler"><Select name="partnerId">{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Rate ₹/kg"><Input name="rate" type="number" step="0.5" defaultValue={(partners[0]?.ratePerKgPaise ?? 900) / 100} /></Field>
              <Field label="Vehicle no."><Input name="vehicleNumber" /></Field>
            </div>
            <SubmitButton>Dispatch selected lots</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Donations to hand over" />
          <Table>
            <thead><tr><Th>Donation</Th><Th>NGO</Th><Th className="text-right">Weight</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {donations.map((d) => (
                <tr key={d.id}><Td><div className="num font-medium">{d.code}</div><div className="text-xs text-muted">{d.booking.code}</div></Td><Td>{d.partner.name}</Td><Td className="num text-right">{formatKg(d.collectedGrams)}</Td><Td><StatusBadge map={donationStatus} value={d.status} /></Td><Td>{d.status === "COLLECTED" && <ActionButton action={handoverDonationAction} fields={{ donationId: d.id }}>Hand over</ActionButton>}</Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Recycler dispatches" />
        <Table>
          <thead><tr><Th>Dispatch</Th><Th>Partner</Th><Th className="text-right">Dispatched</Th><Th className="text-right">Received</Th><Th className="text-right">Settlement</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {dispatches.map((d) => (
              <tr key={d.id}>
                <Td><div className="num font-medium">{d.code}</div><div className="text-xs text-muted">{formatDate(d.dispatchedAt)}</div></Td>
                <Td>{d.partner.name}</Td>
                <Td className="num text-right">{formatKg(d.dispatchedGrams)}</Td>
                <Td className="num text-right">{d.receivedGrams !== null ? formatKg(d.receivedGrams) : "—"}</Td>
                <Td className="num text-right">{d.settlementPaise ? formatINR(d.settlementPaise) : "—"}</Td>
                <Td><StatusBadge map={dispatchStatus} value={d.status} /></Td>
                <Td>{d.status === "DELIVERED" && isAdmin && (
                  <ActionForm action={settleDispatchAction} className="flex gap-1"><input type="hidden" name="dispatchId" value={d.id} /><Input name="settlementRef" placeholder="NEFT ref" className="h-8 w-28 text-xs" /><SubmitButton size="sm">Settle</SubmitButton></ActionForm>
                )}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
