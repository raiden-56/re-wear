import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { businessPricingAction, createListingAction, verifyBusinessAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, PageHeader, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { businessTypeLabel, gradeLabel, poStatus, verificationStatus } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "B2B" };

export default async function AdminB2B({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const tab = (await searchParams).tab ?? "orders";
  const [businesses, listings, orders, categories, lots] = await Promise.all([
    db.businessProfile.findMany({ include: { user: true, _count: { select: { purchaseOrders: true } } }, orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }] }),
    db.businessListing.findMany({ include: { category: true, inventoryItem: true }, orderBy: { createdAt: "desc" } }),
    db.purchaseOrder.findMany({ include: { business: true, listing: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.clothingCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.inventoryItem.findMany({ where: { kind: "LOT", grade: { notIn: ["UNSORTED", "REJECTED"] }, weightGrams: { gt: 10000 }, status: "IN_STOCK" }, orderBy: { weightGrams: "desc" }, take: 40, include: { warehouse: true } }),
  ]);
  return (
    <>
      <PageHeader title="B2B portal management" description="Verify partners, publish graded bulk stock, negotiate and fulfil purchase orders." />
      <Tabs items={[{ href: "/admin/b2b", label: "Purchase orders", count: orders.filter((o) => ["REQUESTED", "NEGOTIATING"].includes(o.status)).length }, { href: "/admin/b2b?tab=accounts", label: "Business accounts", count: businesses.filter((b) => b.verificationStatus === "PENDING").length }, { href: "/admin/b2b?tab=listings", label: "Bulk listings" }]} active={tab === "orders" ? "/admin/b2b" : `/admin/b2b?tab=${tab}`} />
      {tab === "orders" && (
        <Card>
          <Table>
            <thead><tr><Th>PO</Th><Th>Business</Th><Th>Listing</Th><Th className="text-right">Qty</Th><Th className="text-right">Price/kg</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-cream/40">
                  <Td><Link href={`/admin/b2b/${o.id}`} className="num font-semibold text-forest hover:underline">{o.code}</Link><div className="text-xs text-muted">{formatDate(o.updatedAt)}</div></Td>
                  <Td className="text-sm">{o.business.tradeName ?? o.business.legalName}</Td>
                  <Td className="max-w-48 truncate text-sm">{o.listing.title}</Td>
                  <Td className="num text-right">{formatKg(o.requestedGrams, 0)}</Td>
                  <Td className="num text-right">{formatINR(o.agreedPricePerKgPaise ?? o.listPricePerKgPaise)}</Td>
                  <Td className="num text-right">{o.totalPaise ? formatINR(o.totalPaise) : "—"}</Td>
                  <Td><StatusBadge map={poStatus} value={o.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === "accounts" && (
        <Card>
          <Table>
            <thead><tr><Th>Business</Th><Th>Type / GSTIN</Th><Th>Status</Th><Th>Verification</Th><Th>Pricing tier</Th></tr></thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <Td><div className="font-medium">{b.legalName}</div><div className="text-xs text-muted">{b.city} · {b.user.phone} · {b._count.purchaseOrders} orders</div></Td>
                  <Td className="text-sm">{businessTypeLabel[b.businessType]}<div className="num text-xs text-muted">{b.gstin ?? "No GSTIN"}</div></Td>
                  <Td><StatusBadge map={verificationStatus} value={b.verificationStatus} /></Td>
                  <Td>
                    <div className="flex gap-1">
                      {b.verificationStatus !== "VERIFIED" && <ActionButton action={verifyBusinessAction} fields={{ profileId: b.id, decision: "VERIFIED" }} variant="primary">Verify</ActionButton>}
                      {b.verificationStatus === "PENDING" && <ActionButton action={verifyBusinessAction} fields={{ profileId: b.id, decision: "REJECTED", reason: "GSTIN could not be validated" }} variant="ghost">Reject</ActionButton>}
                      {b.verificationStatus === "VERIFIED" && <ActionButton action={verifyBusinessAction} fields={{ profileId: b.id, decision: "SUSPENDED", reason: "Suspended by admin" }} variant="ghost">Suspend</ActionButton>}
                    </div>
                  </Td>
                  <Td>
                    <ActionForm action={businessPricingAction} className="flex gap-1">
                      <input type="hidden" name="profileId" value={b.id} />
                      <Input name="priceTier" defaultValue={b.priceTier} className="h-8 w-24 text-xs" aria-label="Tier" />
                      <Input name="discountPct" type="number" step="0.5" defaultValue={b.discountBps / 100} className="num h-8 w-16 text-xs" aria-label="Discount %" />
                      <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === "listings" && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <Table>
              <thead><tr><Th>Listing</Th><Th>Grade</Th><Th className="text-right">Available</Th><Th className="text-right">Reserved</Th><Th className="text-right">₹/kg</Th><Th className="text-right">MOQ</Th></tr></thead>
              <tbody>{listings.map((l) => <tr key={l.id}><Td><div className="font-medium">{l.title}</div><div className="num text-xs text-muted">{l.code} · {l.inventoryItem?.code ?? "unlinked"}</div></Td><Td><StatusBadge map={gradeLabel} value={l.grade} /></Td><Td className="num text-right">{formatKg(l.availableGrams, 0)}</Td><Td className="num text-right">{formatKg(l.reservedGrams, 0)}</Td><Td className="num text-right">{formatINR(l.pricePerKgPaise)}</Td><Td className="num text-right">{formatKg(l.minOrderGrams, 0)}</Td></tr>)}</tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Publish bulk stock" />
            <ActionForm action={createListingAction} resetOnSuccess className="space-y-3 p-5">
              <Field label="Title"><Input name="title" /></Field>
              <Field label="Description"><Input name="description" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Grade"><Select name="grade">{["STANDARD_REUSABLE", "PREMIUM_REUSABLE", "REPAIRABLE", "RECYCLABLE", "UPCYCLING"].map((g) => <option key={g} value={g}>{gradeLabel[g].label}</option>)}</Select></Field>
                <Field label="Category"><Select name="categoryId">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              </div>
              <Field label="Linked stock lot" hint="Dispatch deducts weight from this lot."><Select name="inventoryItemId"><option value="">— none —</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.code} · {gradeLabel[l.grade].label} · {formatKg(l.weightGrams, 0)} · {l.warehouse.code}</option>)}</Select></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Available kg"><Input name="availableKg" type="number" /></Field>
                <Field label="₹/kg"><Input name="price" type="number" step="0.5" /></Field>
                <Field label="MOQ kg"><Input name="moqKg" type="number" /></Field>
              </div>
              <fieldset><legend className="mb-1 text-sm font-medium">Visible to (empty = all)</legend><div className="grid grid-cols-2 gap-1.5">{Object.entries(businessTypeLabel).map(([k, v]) => <Checkbox key={k} name="allowedTypes" value={k} label={v} />)}</div></fieldset>
              <SubmitButton>Publish listing</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
