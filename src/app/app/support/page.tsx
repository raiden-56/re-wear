import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { createTicketAction } from "@/app/actions/customer";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ticketStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Help & support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ bookingId?: string }> }) {
  const user = await requireRole(["CUSTOMER"]);
  const { bookingId } = await searchParams;
  const [tickets, bookings] = await Promise.all([
    db.supportTicket.findMany({ where: { userId: user.id }, include: { booking: true }, orderBy: { updatedAt: "desc" } }),
    db.booking.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, code: true } }),
  ]);
  return (
    <>
      <PageHeader title="Help & support" description="Disputes, payment questions or anything else — we reply within one working day." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Your tickets" />
          <div className="divide-y divide-line">
            {tickets.length === 0 && <div className="p-5"><EmptyState icon={LifeBuoy} title="No tickets" description="Raise one using the form." /></div>}
            {tickets.map((t) => (
              <Link key={t.id} href={`/app/support/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-cream/50">
                <div><div className="font-medium">{t.subject}</div><div className="text-xs text-muted">{t.code}{t.booking ? ` · ${t.booking.code}` : ""} · {formatDate(t.updatedAt)}</div></div>
                <StatusBadge map={ticketStatus} value={t.status} />
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Raise a ticket" />
          <ActionForm action={createTicketAction} resetOnSuccess className="space-y-4 p-5">
            <Field label="Topic"><Select name="type" defaultValue={bookingId ? "PICKUP" : "GENERAL"}><option value="GENERAL">General</option><option value="PICKUP">Pickup</option><option value="PAYMENT">Payment</option><option value="ORDER">Shop order</option></Select></Field>
            <Field label="Related pickup (optional)"><Select name="bookingId" defaultValue={bookingId ?? ""}><option value="">—</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</Select></Field>
            <Field label="Subject"><Input name="subject" /><FieldError name="subject" /></Field>
            <Field label="Details"><Textarea name="body" rows={5} /><FieldError name="body" /></Field>
            <SubmitButton>Submit</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
