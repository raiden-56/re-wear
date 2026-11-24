import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { staffReplyAction, ticketStatusAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ticketStatus } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const t = await db.supportTicket.findUnique({ where: { id: (await params).id }, include: { user: true, booking: true, messages: { include: { author: true }, orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  return (
    <>
      <Link href="/admin/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Support</Link>
      <PageHeader title={t.subject} description={`${t.code} · ${t.user.name}${t.booking ? ` · booking ${t.booking.code}` : ""}`} actions={<StatusBadge map={ticketStatus} value={t.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="space-y-4 p-5">
          <ul className="space-y-3">
            {t.messages.map((m) => (
              <li key={m.id} className={cn("max-w-[85%] rounded-2xl p-4 text-sm", m.authorId === t.userId ? "bg-cream" : m.internal ? "ml-auto bg-amber-100" : "ml-auto bg-forest text-white")}>
                <div className="mb-1 text-xs opacity-70">{m.author.name} · {formatDate(m.createdAt, true)}{m.internal && " · internal"}</div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
          <ActionForm action={staffReplyAction} resetOnSuccess className="space-y-2 border-t border-line pt-4">
            <input type="hidden" name="ticketId" value={t.id} />
            <Textarea name="body" rows={3} placeholder="Reply to the customer…" />
            <div className="flex items-center justify-between"><Checkbox name="internal" label="Internal note (not visible to customer)" /><SubmitButton size="sm">Send</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Status" />
          <ActionForm action={ticketStatusAction} className="space-y-3 p-5">
            <input type="hidden" name="ticketId" value={t.id} />
            <Select name="status" defaultValue={t.status}>{Object.entries(ticketStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            <Input name="resolution" defaultValue={t.resolution ?? ""} placeholder="Resolution summary" />
            <SubmitButton size="sm">Update</SubmitButton>
            {t.booking && t.type === "DISPUTE" && <Link href={`/admin/bookings/${t.booking.id}`} className="block text-sm text-forest">Open booking to resolve the dispute →</Link>}
            <p className="text-xs text-muted">Handled by {user.name}</p>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
