import type { Prisma } from "@prisma/client";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; actor?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.action ? { action: { contains: sp.action } } : {}),
    ...(sp.entity ? { OR: [{ entityType: { contains: sp.entity, mode: "insensitive" } }, { entityId: sp.entity }] } : {}),
    ...(sp.actor ? { actor: { name: { contains: sp.actor, mode: "insensitive" } } } : {}),
  };
  const logs = await db.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of every sensitive action — who, what, when, before and after." />
      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input name="action" defaultValue={sp.action} placeholder="Action, e.g. payout." className="h-10" aria-label="Action" />
        <Input name="entity" defaultValue={sp.entity} placeholder="Entity type or ID" className="h-10" aria-label="Entity" />
        <Input name="actor" defaultValue={sp.actor} placeholder="Actor name" className="h-10" aria-label="Actor" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Change</Th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDate(l.createdAt, true)}</Td>
                <Td className="text-sm">{l.actor?.name ?? "System"}<div className="text-xs text-muted">{l.actorRole}</div></Td>
                <Td className="num text-xs font-medium">{l.action}</Td>
                <Td className="num text-xs">{l.entityType}<div className="text-muted">{l.entityId?.slice(0, 14)}</div></Td>
                <Td><code className="block max-w-md truncate text-[11px] text-muted">{l.after ? JSON.stringify(l.after) : "—"}</code></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
