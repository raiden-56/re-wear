import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { weightTrail } from "@/server/services/warehouse";
import { Card, CardHeader, KeyValue, Notice, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { SortForm } from "@/components/warehouse/sort-form";
import { ReinspectForm } from "@/components/warehouse/reinspect-form";
import { gradeLabel } from "@/lib/labels";
import { formatDate, formatKg, titleCase } from "@/lib/utils";

export default async function BatchDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const batch = await db.collectionBatch.findUnique({
    where: { id: (await params).id },
    include: { warehouse: true, booking: { include: { payout: true, weighings: { orderBy: { createdAt: "desc" }, take: 1 } } }, items: { include: { category: true } }, inspections: { orderBy: { createdAt: "desc" } } },
  });
  if (!batch) notFound();
  const [categories, trail] = await Promise.all([db.clothingCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }), weightTrail(batch.bookingId)]);
  const unsorted = batch.items.find((i) => i.grade === "UNSORTED");
  const w = batch.booking.weighings[0];
  const weights = (w?.categoryWeights as { categoryId: string; grams: number }[]) ?? [];
  const pct = batch.collectedGrams ? ((batch.receivedGrams - batch.collectedGrams) / batch.collectedGrams) * 100 : 0;
  const canRevise = batch.booking.channel !== "DONATION" && (!batch.booking.payout || ["AWAITING_APPROVAL", "UNDER_REVIEW", "APPROVED"].includes(batch.booking.payout.status)) && batch.booking.status === "COMPLETED";

  return (
    <>
      <Link href="/warehouse/batches" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Batches</Link>
      <PageHeader title={<span className="num">{batch.code}</span>} description={`Booking ${batch.booking.code} · ${batch.warehouse.name} · received ${formatDate(batch.receivedAt, true)}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Weight trail" />
            <div className="p-5">
              <KeyValue items={[
                ["Collected (doorstep, accepted)", formatKg(trail?.collectedGrams)],
                ["Received at warehouse", formatKg(trail?.receivedGrams)],
                ["Receipt variance", `${pct.toFixed(1)}%`],
                ["Sorted", formatKg(trail?.sortedGrams)],
                ["Dispatched / sold", formatKg(trail?.dispatchedGrams)],
                ["Sorting loss", formatKg(trail?.lossGrams)],
              ]} />
              {Math.abs(pct) > 5 && <Notice tone="warn" className="mt-3" title="Variance above 5%">Re-inspect the batch. If the doorstep valuation was wrong, issue a revised valuation for the customer's approval.</Notice>}
            </div>
          </Card>
          {canRevise && (
            <Card>
              <CardHeader title="Re-inspection valuation" description="Customer must approve any revision before it applies to their payout." />
              <div className="p-5"><ReinspectForm bookingId={batch.bookingId} categories={weights.map((x) => ({ id: x.categoryId, name: categories.find((c) => c.id === x.categoryId)?.name ?? "?", grams: x.grams }))} /></div>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {unsorted && unsorted.weightGrams > 0 && ["RECEIVED", "SORTING"].includes(batch.status) && (
            <Card>
              <CardHeader title="Sort this batch" description={`${formatKg(unsorted.weightGrams)} unsorted`} />
              <div className="p-5"><SortForm batchId={batch.id} unsortedGrams={unsorted.weightGrams} categories={categories.map((c) => ({ id: c.id, name: c.name }))} defaultCategoryId={weights[0]?.categoryId ?? categories[0].id} /></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Inventory from this batch" />
            <Table>
              <thead><tr><Th>Code</Th><Th>Grade</Th><Th>Category</Th><Th className="text-right">Weight</Th><Th>Status</Th></tr></thead>
              <tbody>
                {batch.items.map((i) => (
                  <tr key={i.id}><Td><Link href={`/warehouse/inventory/${i.id}`} className="num font-medium text-forest hover:underline">{i.code}</Link></Td><Td><StatusBadge map={gradeLabel} value={i.grade} /></Td><Td>{i.category.name}</Td><Td className="num text-right">{formatKg(i.weightGrams)}</Td><Td className="text-xs">{titleCase(i.status)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {batch.inspections.length > 0 && (
            <Card>
              <CardHeader title="Quality inspections" />
              <ul className="divide-y divide-line text-sm">{batch.inspections.map((q) => <li key={q.id} className="flex justify-between px-5 py-2.5"><span>{gradeLabel[q.grade]?.label} — {titleCase(q.result)}{q.notes ? ` · ${q.notes}` : ""}</span><span className="text-xs text-muted">{formatDate(q.createdAt, true)}</span></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
