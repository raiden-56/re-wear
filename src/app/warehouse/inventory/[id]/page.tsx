import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, Store } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { adjustmentAction, inspectItemAction, transferAction } from "@/app/actions/warehouse";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, KeyValue, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { PrintButton } from "@/components/print-button";
import { UnitForm } from "@/components/warehouse/unit-form";
import { gradeLabel } from "@/lib/labels";
import { formatDate, formatKg, titleCase } from "@/lib/utils";

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const item = await db.inventoryItem.findUnique({
    where: { id: (await params).id },
    include: { category: true, warehouse: true, batch: { include: { booking: true } }, movements: { orderBy: { createdAt: "desc" }, take: 100 }, inspections: { orderBy: { createdAt: "desc" } }, product: true },
  });
  if (!item) notFound();
  const warehouses = await db.warehouseLocation.findMany({ where: { active: true, id: { not: item.warehouseId } } });
  const qr = await QRCode.toDataURL(`REWEAR:${item.code}`, { margin: 1, width: 220, color: { dark: "#292E2B", light: "#FFFFFF" } });
  const active = ["IN_STOCK", "LISTED"].includes(item.status);
  return (
    <>
      <Link href="/warehouse/inventory" className="no-print mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Inventory</Link>
      <PageHeader title={<span className="num">{item.code}</span>} description={item.title ?? `${gradeLabel[item.grade]?.label} · ${item.category.name}`} actions={<StatusBadge map={gradeLabel} value={item.grade} />} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card className="p-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR label for ${item.code}`} className="mx-auto size-44" />
            <div className="num mt-2 font-display text-lg font-bold">{item.code}</div>
            <div className="text-xs text-muted">{item.category.name} · {formatKg(item.weightGrams)} · {item.warehouse.code}</div>
            <div className="mt-3"><PrintButton label="Print label" /></div>
          </Card>
          <Card className="no-print p-5">
            <KeyValue items={[
              ["Type", item.kind === "UNIT" ? "Individual garment" : "Weight lot"],
              ["Weight", formatKg(item.weightGrams)],
              ["Status", titleCase(item.status)],
              ["Warehouse", item.warehouse.name],
              ["Batch", item.batch ? <Link key="b" href={`/warehouse/batches/${item.batchId}`} className="text-forest underline">{item.batch.code}</Link> : "Consolidated bin"],
              ...(item.kind === "UNIT" ? [["Brand / size", `${item.brand ?? "—"} / ${item.size ?? "—"}`] as [string, string], ["Inspection", item.inspectionPassed ? "Passed" : "Not passed"] as [string, string]] : []),
            ]} />
          </Card>
        </div>
        <div className="no-print space-y-6">
          {item.kind === "UNIT" && (
            <Card>
              <CardHeader title="Premium inspection & listing" />
              <div className="space-y-4 p-5">
                <ActionForm action={inspectItemAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Field label="Result"><Select name="result" className="w-44"><option value="PASSED">Passed</option><option value="NEEDS_REPAIR">Needs repair</option><option value="FAILED">Failed (downgrade)</option></Select></Field>
                  <Field label="Notes" className="flex-1"><Input name="notes" placeholder="Stitching, zips, stains checked…" /></Field>
                  <SubmitButton variant="secondary">Record inspection</SubmitButton>
                </ActionForm>
                {item.product ? (
                  <p className="text-sm">Listed as <Link href={`/warehouse/listings`} className="font-medium text-forest underline">{item.product.name}</Link> ({titleCase(item.product.status)})</p>
                ) : item.inspectionPassed && item.grade === "PREMIUM_REUSABLE" ? (
                  <Button asChild><Link href={`/warehouse/listings/new?itemId=${item.id}`}><Store /> Create resale listing</Link></Button>
                ) : (
                  <p className="text-sm text-muted">A listing can be created once the garment passes premium inspection.</p>
                )}
              </div>
            </Card>
          )}
          {item.kind === "LOT" && item.grade === "PREMIUM_REUSABLE" && active && (
            <Card>
              <CardHeader title="Pull out a premium garment" description="Creates an individually tracked garment from this lot." />
              <div className="p-5"><UnitForm lotId={item.id} /></div>
            </Card>
          )}
          {active && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader title="Transfer" />
                <ActionForm action={transferAction} className="space-y-3 p-5">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Select name="toWarehouseId" aria-label="Destination">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select>
                  <Input name="reason" placeholder="Reason (optional)" />
                  <SubmitButton variant="secondary">Transfer</SubmitButton>
                </ActionForm>
              </Card>
              <Card>
                <CardHeader title="Request adjustment" description="Needs another manager's approval." />
                <ActionForm action={adjustmentAction} className="space-y-3 p-5">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Input name="deltaKg" type="number" step="0.01" placeholder="± kg, e.g. -1.25" />
                  <Input name="reason" placeholder="Reason (count error, damage…)" />
                  <SubmitButton variant="secondary">Submit</SubmitButton>
                </ActionForm>
              </Card>
            </div>
          )}
          <Card>
            <CardHeader title="Stock history" />
            <Table>
              <thead><tr><Th>When</Th><Th>Movement</Th><Th>Reference</Th><Th className="text-right">Δ Weight</Th><Th>Status</Th></tr></thead>
              <tbody>
                {item.movements.map((m) => (
                  <tr key={m.id}><Td className="text-xs text-muted">{formatDate(m.createdAt, true)}</Td><Td>{titleCase(m.type)}{m.reason && <div className="text-xs text-muted">{m.reason}</div>}</Td><Td className="num text-xs">{m.referenceType ? `${titleCase(m.referenceType)}` : "—"}</Td><Td className={`num text-right ${m.deltaGrams < 0 ? "text-danger" : "text-forest"}`}>{m.deltaGrams > 0 ? "+" : ""}{formatKg(m.deltaGrams)}</Td><Td className="text-xs">{titleCase(m.status)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
