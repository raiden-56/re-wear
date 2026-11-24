import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, Card, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { formatDate, formatKg, titleCase } from "@/lib/utils";

export const metadata = { title: "Batches" };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const status = (await searchParams).status ?? "open";
  const batches = await db.collectionBatch.findMany({
    where: status === "open" ? { status: { in: ["RECEIVED", "SORTING"] } } : { status: { in: ["SORTED", "CLOSED"] } },
    include: { warehouse: true, booking: true },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Batches & sorting" description="Every batch is traceable from collected weight → received → sorted → dispatched." />
      <Tabs items={[{ href: "/warehouse/batches", label: "To sort" }, { href: "/warehouse/batches?status=done", label: "Sorted" }]} active={status === "open" ? "/warehouse/batches" : "/warehouse/batches?status=done"} />
      <Card>
        <Table>
          <thead><tr><Th>Batch</Th><Th>Booking</Th><Th>Warehouse</Th><Th className="text-right">Collected</Th><Th className="text-right">Received</Th><Th className="text-right">Sorted</Th><Th>Variance</Th><Th>Status</Th></tr></thead>
          <tbody>
            {batches.map((b) => {
              const pct = b.collectedGrams ? ((b.receivedGrams - b.collectedGrams) / b.collectedGrams) * 100 : 0;
              return (
                <tr key={b.id} className="hover:bg-cream/40">
                  <Td><Link href={`/warehouse/batches/${b.id}`} className="num font-semibold text-forest hover:underline">{b.code}</Link><div className="text-xs text-muted">{formatDate(b.receivedAt)}</div></Td>
                  <Td className="num">{b.booking.code}</Td>
                  <Td>{b.warehouse.code}</Td>
                  <Td className="num text-right">{formatKg(b.collectedGrams)}</Td>
                  <Td className="num text-right">{formatKg(b.receivedGrams)}</Td>
                  <Td className="num text-right">{formatKg(b.sortedGrams)}</Td>
                  <Td>{Math.abs(pct) > 5 ? <Badge tone="red">{pct.toFixed(1)}%</Badge> : <span className="num text-xs text-muted">{pct.toFixed(1)}%</span>}</Td>
                  <Td><Badge tone={b.status === "SORTED" ? "green" : b.status === "SORTING" ? "amber" : "blue"}>{titleCase(b.status)}</Badge></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
