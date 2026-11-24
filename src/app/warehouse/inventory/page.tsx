import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Card, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { gradeLabel } from "@/lib/labels";
import { formatDate, formatKg, titleCase } from "@/lib/utils";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ grade?: string; status?: string; warehouse?: string; kind?: string; q?: string }> }) {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const where: Prisma.InventoryItemWhereInput = {
    ...(sp.grade ? { grade: sp.grade as never } : {}),
    ...(sp.status ? { status: sp.status as never } : { status: { in: ["IN_STOCK", "LISTED", "RESERVED"] } }),
    ...(sp.warehouse ? { warehouseId: sp.warehouse } : {}),
    ...(sp.kind ? { kind: sp.kind as never } : {}),
    ...(sp.q ? { OR: [{ code: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [items, warehouses, agg] = await Promise.all([
    db.inventoryItem.findMany({ where, include: { category: true, warehouse: true, batch: true }, orderBy: [{ weightGrams: "desc" }], take: 300 }),
    db.warehouseLocation.findMany({ orderBy: { code: "asc" } }),
    db.inventoryItem.aggregate({ where, _sum: { weightGrams: true }, _count: true }),
  ]);
  return (
    <>
      <PageHeader title="Inventory" description={`${agg._count} items · ${formatKg(agg._sum.weightGrams, 0)} in view`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Code or title" className="h-10 rounded-xl border border-line bg-white px-3 text-sm sm:col-span-2" aria-label="Search" />
        <Select name="grade" defaultValue={sp.grade ?? ""} className="h-10" aria-label="Grade"><option value="">All grades</option>{Object.entries(gradeLabel).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10" aria-label="Status"><option value="">In stock / listed</option>{["IN_STOCK", "LISTED", "RESERVED", "DISPATCHED", "SOLD", "SCRAPPED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        <Select name="warehouse" defaultValue={sp.warehouse ?? ""} className="h-10" aria-label="Warehouse"><option value="">All warehouses</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><Th>Code</Th><Th>Type</Th><Th>Grade</Th><Th>Category</Th><Th>Warehouse</Th><Th>Batch</Th><Th className="text-right">Weight</Th><Th>Status</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="hover:bg-cream/40">
                <Td><Link href={`/warehouse/inventory/${i.id}`} className="num font-medium text-forest hover:underline">{i.code}</Link>{i.title && <div className="max-w-56 truncate text-xs text-muted">{i.title}</div>}</Td>
                <Td className="text-xs">{i.kind === "UNIT" ? "Garment" : "Lot"}</Td>
                <Td><StatusBadge map={gradeLabel} value={i.grade} /></Td>
                <Td>{i.category.name}</Td>
                <Td>{i.warehouse.code}</Td>
                <Td className="num text-xs">{i.batch?.code ?? "Consolidated"}</Td>
                <Td className="num text-right font-medium">{formatKg(i.weightGrams)}</Td>
                <Td className="text-xs">{titleCase(i.status)}</Td>
                <Td className="text-xs text-muted">{formatDate(i.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
