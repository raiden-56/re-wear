import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, Card, CardHeader, PageHeader, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { ticketStatus } from "@/lib/labels";
import { formatDate, titleCase } from "@/lib/utils";

export const metadata = { title: "Support & disputes" };

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const tab = (await searchParams).tab ?? "open";
  const [tickets, contacts] = await Promise.all([
    db.supportTicket.findMany({ where: tab === "open" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : { status: { in: ["RESOLVED", "CLOSED"] } }, include: { user: true, booking: true, _count: { select: { messages: true } } }, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }] }),
    db.contactRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Support & disputes" />
      <Tabs items={[{ href: "/admin/support", label: "Open" }, { href: "/admin/support?tab=closed", label: "Resolved" }]} active={tab === "open" ? "/admin/support" : "/admin/support?tab=closed"} />
      <Card>
        <Table>
          <thead><tr><Th>Ticket</Th><Th>Customer</Th><Th>Type</Th><Th>Booking</Th><Th>Updated</Th><Th>Status</Th></tr></thead>
          <tbody>{tickets.map((t) => <tr key={t.id} className="hover:bg-cream/40"><Td><Link href={`/admin/support/${t.id}`} className="font-medium text-forest hover:underline">{t.subject}</Link><div className="num text-xs text-muted">{t.code} · {t._count.messages} messages</div></Td><Td className="text-sm">{t.user.name}</Td><Td>{t.type === "DISPUTE" ? <Badge tone="red">Dispute</Badge> : <span className="text-sm">{titleCase(t.type)}</span>}</Td><Td className="num text-sm">{t.booking ? <Link href={`/admin/bookings/${t.booking.id}`} className="text-forest">{t.booking.code}</Link> : "—"}</Td><Td className="text-xs text-muted">{formatDate(t.updatedAt, true)}</Td><Td><StatusBadge map={ticketStatus} value={t.status} /></Td></tr>)}</tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Website enquiries" />
        <ul className="divide-y divide-line text-sm">{contacts.map((c) => <li key={c.id} className="px-5 py-3"><div className="flex justify-between"><span className="font-medium">{c.name} · {titleCase(c.topic)}</span><span className="text-xs text-muted">{formatDate(c.createdAt, true)}</span></div><p className="text-muted">{c.message}</p><p className="text-xs text-muted">{c.email} {c.phone}</p></li>)}</ul>
      </Card>
    </>
  );
}
