import Link from "next/link";
import { AlertTriangle, ArrowRight, Boxes, ClipboardCheck, PackageOpen, ScanLine } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, CardHeader, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { gradeLabel } from "@/lib/labels";
import { formatDate, formatKg, titleCase } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function WarehouseHome() {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const [awaiting, toSort, stock, pendingAdj, moves, flagged] = await Promise.all([
    db.booking.count({ where: { status: "COMPLETED", batch: null, channel: { not: "DONATION" } } }),
    db.collectionBatch.count({ where: { status: { in: ["RECEIVED", "SORTING"] } } }),
    db.inventoryItem.groupBy({ by: ["grade"], where: { status: { in: ["IN_STOCK", "LISTED", "RESERVED"] } }, _sum: { weightGrams: true }, _count: true }),
    db.inventoryMovement.count({ where: { status: "PENDING_APPROVAL" } }),
    db.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { item: { include: { category: true } } } }),
    db.collectionBatch.findMany({ where: { status: { in: ["RECEIVED", "SORTING"] } }, orderBy: { receivedAt: "desc" }, take: 50 }),
  ]);
  const flaggedCount = flagged.filter((b) => b.collectedGrams && Math.abs(b.varianceGrams) / b.collectedGrams > 0.05).length;
  const unsorted = stock.find((s) => s.grade === "UNSORTED")?._sum.weightGrams ?? 0;
  return (
    <>
      <PageHeader title="Warehouse overview" description="Receiving, sorting and stock across all hubs." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/warehouse/receiving"><Stat label="Awaiting receipt" value={awaiting} icon={PackageOpen} tone={awaiting ? "amber" : "neutral"} hint="Completed pickups in transit" /></Link>
        <Link href="/warehouse/batches"><Stat label="Batches to sort" value={toSort} icon={ScanLine} hint={`${formatKg(unsorted, 0)} unsorted`} /></Link>
        <Link href="/warehouse/adjustments"><Stat label="Adjustments to approve" value={pendingAdj} icon={ClipboardCheck} /></Link>
        <Stat label="Variance flags" value={flaggedCount} icon={AlertTriangle} hint="> 5% weight difference" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader title="Stock by grade" action={<Link href="/warehouse/inventory" className="text-sm font-medium text-forest">Inventory</Link>} />
          <ul className="divide-y divide-line">
            {stock.sort((a, b) => (b._sum.weightGrams ?? 0) - (a._sum.weightGrams ?? 0)).map((s) => (
              <li key={s.grade}><Link href={`/warehouse/inventory?grade=${s.grade}`} className="flex items-center justify-between px-5 py-3 hover:bg-cream/50"><span className="flex items-center gap-2"><Boxes className="size-4 text-sage" />{gradeLabel[s.grade]?.label}</span><span className="num text-sm"><span className="font-semibold">{formatKg(s._sum.weightGrams, 0)}</span> <span className="text-muted">· {s._count} lots</span></span></Link></li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent stock movements" />
          <Table>
            <thead><tr><Th>When</Th><Th>Item</Th><Th>Type</Th><Th className="text-right">Δ Weight</Th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <Td className="text-xs text-muted">{formatDate(m.createdAt, true)}</Td>
                  <Td><Link href={`/warehouse/inventory/${m.itemId}`} className="num font-medium hover:underline">{m.item.code}</Link><div className="text-xs text-muted">{m.item.category.name}</div></Td>
                  <Td>{titleCase(m.type)}{m.status !== "POSTED" && <span className="ml-1 text-xs text-[#7a5317]">({titleCase(m.status)})</span>}</Td>
                  <Td className={`num text-right ${m.deltaGrams < 0 ? "text-danger" : "text-forest"}`}>{m.deltaGrams > 0 ? "+" : ""}{formatKg(m.deltaGrams)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="px-5 py-3"><Link href="/warehouse/inventory" className="inline-flex items-center gap-1 text-sm font-medium text-forest">Full stock history <ArrowRight className="size-4" /></Link></div>
        </Card>
      </div>
    </>
  );
}
