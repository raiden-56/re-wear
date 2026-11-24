import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { approvePayoutAction, holdPayoutAction, initiatePayoutAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, KeyValue, Notice, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { payoutStatus } from "@/lib/labels";
import { formatDate, formatINR, titleCase } from "@/lib/utils";

export default async function PayoutDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const p = await db.payout.findUnique({ where: { id: (await params).id }, include: { customer: true, booking: true, attempts: { orderBy: { attemptNumber: "desc" } } } });
  if (!p) notFound();
  const [ledger, audit] = await Promise.all([
    db.financialLedger.findMany({ where: { referenceType: "PAYOUT", referenceId: p.id }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { entityType: "Payout", entityId: p.id }, include: { actor: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <Link href="/admin/payments" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Payouts</Link>
      <PageHeader title={<span className="num">{p.code}</span>} description={`${p.customer.name} · booking ${p.booking.code}`} actions={<StatusBadge map={payoutStatus} value={p.status} />} />
      {p.failureReason && <Notice tone={p.status === "SUCCESSFUL" ? "info" : "warn"} className="mb-4">{p.failureReason}</Notice>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <KeyValue items={[
              ["Amount", formatINR(p.amountPaise)],
              ["UPI ID", p.upiVpa ?? "Not provided"],
              ["Provider", p.provider],
              ["Provider reference", p.providerRef ?? "—"],
              ["UTR", p.utr ?? "—"],
              ["Approved", p.approvedAt ? formatDate(p.approvedAt, true) : "—"],
              ["Completed", p.completedAt ? formatDate(p.completedAt, true) : "—"],
              ["Attempts", p.attemptCount],
            ]} />
            {p.status === "SUCCESSFUL" && <Link href={`/receipts/payout/${p.code}`} className="mt-3 inline-flex items-center gap-1 text-sm text-forest"><Receipt className="size-4" /> Receipt</Link>}
          </Card>
          <Card className="space-y-3 p-5">
            {["AWAITING_APPROVAL", "UNDER_REVIEW"].includes(p.status) && <ActionButton action={approvePayoutAction} fields={{ payoutId: p.id, andSend: "true" }} variant="primary" size="md">Approve & send</ActionButton>}
            {p.status === "APPROVED" && <ActionButton action={initiatePayoutAction} fields={{ payoutId: p.id }} variant="primary" size="md">Send payout</ActionButton>}
            {["FAILED", "REVERSED"].includes(p.status) && <ActionButton action={initiatePayoutAction} fields={{ payoutId: p.id }} size="md">Retry (new idempotent attempt)</ActionButton>}
            {["AWAITING_APPROVAL", "APPROVED", "FAILED", "REVERSED"].includes(p.status) && (
              <ActionForm action={holdPayoutAction} className="flex gap-2"><input type="hidden" name="payoutId" value={p.id} /><Input name="reason" placeholder="Reason to hold for review" /><SubmitButton variant="ghost">Hold</SubmitButton></ActionForm>
            )}
            {["INITIATED", "PROCESSING"].includes(p.status) && <p className="text-sm text-muted">In flight with the provider. Wait for the webhook or run reconciliation — retrying now is blocked to prevent duplicate payment.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Provider attempts" />
            <Table>
              <thead><tr><Th>#</Th><Th>Idempotency key</Th><Th>Status</Th><Th>Provider ref / UTR</Th><Th>When</Th></tr></thead>
              <tbody>{p.attempts.map((a) => <tr key={a.id}><Td className="num">{a.attemptNumber}</Td><Td className="num text-xs">{a.idempotencyKey}</Td><Td className="text-xs">{titleCase(a.status)}{a.failureReason && <div className="text-muted">{a.failureReason}</div>}</Td><Td className="num text-xs">{a.providerRef ?? "—"}{a.utr && <div>UTR {a.utr}</div>}</Td><Td className="text-xs text-muted">{formatDate(a.createdAt, true)}</Td></tr>)}</tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Ledger entries" />
            <Table>
              <thead><tr><Th>Account</Th><Th>Dr / Cr</Th><Th className="text-right">Amount</Th><Th>When</Th></tr></thead>
              <tbody>{ledger.map((l) => <tr key={l.id}><Td className="text-xs">{titleCase(l.account)}</Td><Td className="text-xs">{l.direction}</Td><Td className="num text-right">{formatINR(l.amountPaise)}</Td><Td className="text-xs text-muted">{formatDate(l.createdAt, true)}</Td></tr>)}</tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Audit trail" />
            <ul className="divide-y divide-line text-sm">{audit.map((a) => <li key={a.id} className="flex justify-between px-5 py-2.5"><span>{a.action} · {a.actor?.name ?? a.actorRole ?? "system"}</span><span className="text-xs text-muted">{formatDate(a.createdAt, true)}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
