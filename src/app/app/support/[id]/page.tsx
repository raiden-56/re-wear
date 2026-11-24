import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { TicketThread } from "@/components/support/ticket-thread";
import { ticketStatus } from "@/lib/labels";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["CUSTOMER"]);
  const t = await db.supportTicket.findFirst({ where: { id: (await params).id, userId: user.id }, include: { booking: true, messages: { include: { author: true }, orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  return (
    <>
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Support</Link>
      <PageHeader title={t.subject} description={`${t.code}${t.booking ? ` · booking ${t.booking.code}` : ""}`} actions={<StatusBadge map={ticketStatus} value={t.status} />} />
      {t.resolution && <p className="mb-4 rounded-xl bg-forest-50 p-3 text-sm text-forest">Resolution: {t.resolution}</p>}
      <Card className="p-5"><TicketThread ticketId={t.id} messages={t.messages} viewerId={user.id} closed={t.status === "CLOSED"} /></Card>
    </>
  );
}
