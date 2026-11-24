import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { decideAdjustmentAction } from "@/app/actions/warehouse";
import { ActionButton } from "@/components/forms/action-form";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate, formatKg } from "@/lib/utils";

export const metadata = { title: "Adjustments" };

export default async function AdjustmentsPage() {
  const user = await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const pending = await db.inventoryMovement.findMany({ where: { status: "PENDING_APPROVAL" }, include: { item: { include: { category: true } } }, orderBy: { createdAt: "asc" } });
  const actors = await db.user.findMany({ where: { id: { in: pending.map((p) => p.actorId) } }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Inventory adjustments" description="Maker–checker: stock changes only after a second manager approves." />
      {pending.length === 0 ? <EmptyState icon={ClipboardCheck} title="No pending adjustments" /> : (
        <Card>
          <Table>
            <thead><tr><Th>Requested</Th><Th>Item</Th><Th>By</Th><Th>Reason</Th><Th className="text-right">Δ Weight</Th><Th /></tr></thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.id}>
                  <Td className="text-xs text-muted">{formatDate(m.createdAt, true)}</Td>
                  <Td><Link href={`/warehouse/inventory/${m.itemId}`} className="num font-medium text-forest">{m.item.code}</Link><div className="text-xs text-muted">{m.item.category.name} · now {formatKg(m.item.weightGrams)}</div></Td>
                  <Td>{actors.find((a) => a.id === m.actorId)?.name ?? "—"}{m.actorId === user.id && <div className="text-xs text-muted">(you)</div>}</Td>
                  <Td className="max-w-64 text-sm">{m.reason}</Td>
                  <Td className={`num text-right font-semibold ${m.deltaGrams < 0 ? "text-danger" : "text-forest"}`}>{m.deltaGrams > 0 ? "+" : ""}{formatKg(m.deltaGrams)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <ActionButton action={decideAdjustmentAction} fields={{ movementId: m.id, approve: "true" }} variant="primary">Approve</ActionButton>
                      <ActionButton action={decideAdjustmentAction} fields={{ movementId: m.id, approve: "false" }} variant="ghost">Reject</ActionButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
