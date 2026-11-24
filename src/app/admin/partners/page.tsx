import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { donationPartnerAction, verifyRecyclerAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, PageHeader, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { dispatchStatus, donationStatus, verificationStatus } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Recycling & NGOs" };

export default async function PartnersAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const tab = (await searchParams).tab ?? "recyclers";
  const [recyclers, dispatches, ngos, donations] = await Promise.all([
    db.recyclerPartner.findMany({ include: { user: true, _count: { select: { dispatches: true } } }, orderBy: { createdAt: "desc" } }),
    db.recyclerDispatch.findMany({ include: { partner: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.donationPartner.findMany({ include: { _count: { select: { donations: true } } }, orderBy: { name: "asc" } }),
    db.donation.findMany({ include: { partner: true, donor: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <>
      <PageHeader title="Recycling & donation partners" description="Recycler settlements are commercial revenue; donations are tracked separately with receipts and NGO acknowledgements." />
      <Tabs items={[{ href: "/admin/partners", label: "Recyclers" }, { href: "/admin/partners?tab=ngos", label: "NGO partners" }, { href: "/admin/partners?tab=donations", label: "Donations" }]} active={tab === "recyclers" ? "/admin/partners" : `/admin/partners?tab=${tab}`} />
      {tab === "recyclers" && (
        <div className="space-y-6">
          <Card>
            <Table>
              <thead><tr><Th>Recycler</Th><Th>Licences</Th><Th>Materials</Th><Th>Status</Th><Th>Rate & verification</Th></tr></thead>
              <tbody>
                {recyclers.map((r) => (
                  <tr key={r.id}>
                    <Td><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.city} · {r.user.phone} · {r._count.dispatches} dispatches</div></Td>
                    <Td className="num text-xs">{r.licenseNumber ?? "—"}<br />{r.pollutionCertNo ?? "—"}</Td>
                    <Td className="text-xs">{r.materialsAccepted.join(", ")}</Td>
                    <Td><StatusBadge map={verificationStatus} value={r.verificationStatus} /></Td>
                    <Td>
                      <ActionForm action={verifyRecyclerAction} className="flex gap-1">
                        <input type="hidden" name="partnerId" value={r.id} />
                        <Input name="rate" type="number" step="0.5" defaultValue={r.ratePerKgPaise / 100} className="num h-8 w-16 text-xs" aria-label="Rate ₹/kg" />
                        <Select name="decision" defaultValue={r.verificationStatus === "PENDING" ? "VERIFIED" : r.verificationStatus} className="h-8 w-28 text-xs" aria-label="Decision"><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="SUSPENDED">Suspended</option></Select>
                        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Dispatches & settlements" description="Create dispatches and record settlements from Warehouse → Dispatch." />
            <Table>
              <thead><tr><Th>Dispatch</Th><Th>Partner</Th><Th className="text-right">Sent</Th><Th className="text-right">Received</Th><Th className="text-right">Settlement</Th><Th>Status</Th></tr></thead>
              <tbody>{dispatches.map((d) => <tr key={d.id}><Td className="num">{d.code}<div className="text-xs text-muted">{formatDate(d.dispatchedAt)}</div></Td><Td>{d.partner.name}</Td><Td className="num text-right">{formatKg(d.dispatchedGrams, 0)}</Td><Td className="num text-right">{d.receivedGrams !== null ? formatKg(d.receivedGrams, 0) : "—"}</Td><Td className="num text-right">{d.settlementPaise ? formatINR(d.settlementPaise) : "—"}{d.settlementRef && <div className="text-xs text-muted">{d.settlementRef}</div>}</Td><Td><StatusBadge map={dispatchStatus} value={d.status} /></Td></tr>)}</tbody>
            </Table>
          </Card>
        </div>
      )}
      {tab === "ngos" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...ngos, null].map((n) => (
            <Card key={n?.id ?? "new"}>
              <CardHeader title={n ? n.name : "Add NGO partner"} description={n ? `${n._count.donations} donations` : undefined} action={n && <StatusBadge map={verificationStatus} value={n.verificationStatus} />} />
              <ActionForm action={donationPartnerAction} resetOnSuccess={!n} className="grid grid-cols-2 gap-3 p-5">
                {n && <input type="hidden" name="id" value={n.id} />}
                <Field label="Name" className="col-span-2"><Input name="name" defaultValue={n?.name} /></Field>
                <Field label="Registration no."><Input name="registrationNo" defaultValue={n?.registrationNo ?? ""} /></Field>
                <Field label="City"><Input name="city" defaultValue={n?.city} /></Field>
                <Field label="Focus areas" className="col-span-2"><Input name="focusAreas" defaultValue={n?.focusAreas.join(", ")} /></Field>
                <Field label="Description" className="col-span-2"><Input name="description" defaultValue={n?.description ?? ""} /></Field>
                <Field label="Status"><Select name="verificationStatus" defaultValue={n?.verificationStatus ?? "PENDING"}><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="SUSPENDED">Suspended</option></Select></Field>
                <div className="flex flex-col justify-end gap-2"><Checkbox name="has80G" defaultChecked={n?.has80G} label="80G registered" /><Checkbox name="active" defaultChecked={n?.active ?? true} label="Shown to donors" /></div>
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      {tab === "donations" && (
        <Card>
          <Table>
            <thead><tr><Th>Donation</Th><Th>Donor</Th><Th>NGO</Th><Th className="text-right">Weight</Th><Th>Receipt</Th><Th>Status</Th></tr></thead>
            <tbody>{donations.map((d) => <tr key={d.id}><Td className="num">{d.code}<div className="text-xs text-muted">{formatDate(d.createdAt)}</div></Td><Td>{d.donor.name}</Td><Td>{d.partner.name}</Td><Td className="num text-right">{d.collectedGrams ? formatKg(d.collectedGrams) : "—"}</Td><Td className="num text-xs">{d.receiptNumber ?? "—"}</Td><Td><StatusBadge map={donationStatus} value={d.status} /></Td></tr>)}</tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
