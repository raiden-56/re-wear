import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { RefreshCw } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { approvePayoutAction, initiatePayoutAction, reconcileAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/forms/action-form";
import { Card, PageHeader, Stat, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { payoutStatus } from "@/lib/labels";
import { formatDate, formatINR, maskVpa } from "@/lib/utils";

export const metadata = { title: "Payouts" };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const status = (await searchParams).status;
  const where: Prisma.PayoutWhereInput = status ? { status: status as never } : {};
  const [payouts, groups, cfg, webhooks] = await Promise.all([
    db.payout.findMany({ where, include: { customer: true, booking: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.payout.groupBy({ by: ["status"], _count: true, _sum: { amountPaise: true } }),
    getSetting("payouts"),
    db.webhookEvent.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  const g = (s: string) => groups.find((x) => x.status === s);
  const tabs = ["AWAITING_APPROVAL", "APPROVED", "PROCESSING", "FAILED", "UNDER_REVIEW", "SUCCESSFUL"].map((s) => ({ href: `/admin/payments?status=${s}`, label: payoutStatus[s].label, count: g(s)?._count ?? 0 }));
  return (
    <>
      <PageHeader
        title="Customer payouts"
        description={`Direct UPI payouts. Auto-approval up to ${formatINR(cfg.autoApproveLimitPaise, { whole: true })}; larger amounts need an admin. Retries reuse provider idempotency — never double-pay.`}
        actions={<ActionButton action={reconcileAction} variant="secondary" size="md"><RefreshCw /> Reconcile with provider</ActionButton>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Awaiting approval" value={formatINR(g("AWAITING_APPROVAL")?._sum.amountPaise ?? 0, { whole: true })} hint={`${g("AWAITING_APPROVAL")?._count ?? 0} payouts`} tone="amber" />
        <Stat label="In flight" value={formatINR((g("INITIATED")?._sum.amountPaise ?? 0) + (g("PROCESSING")?._sum.amountPaise ?? 0), { whole: true })} hint="Initiated + processing" />
        <Stat label="Failed / reversed" value={(g("FAILED")?._count ?? 0) + (g("REVERSED")?._count ?? 0)} hint="Retry or review" />
        <Stat label="Paid (all time)" value={formatINR(g("SUCCESSFUL")?._sum.amountPaise ?? 0, { whole: true })} hint={`${webhooks} webhooks in 24h`} tone="forest" />
      </div>
      <div className="mt-6"><Tabs items={[{ href: "/admin/payments", label: "All" }, ...tabs]} active={status ? `/admin/payments?status=${status}` : "/admin/payments"} /></div>
      <Card>
        <Table>
          <thead><tr><Th>Payout</Th><Th>Customer</Th><Th>UPI</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th>Provider ref</Th><Th /></tr></thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="hover:bg-cream/40">
                <Td><Link href={`/admin/payments/${p.id}`} className="num font-semibold text-forest hover:underline">{p.code}</Link><div className="num text-xs text-muted">{p.booking.code} · {formatDate(p.createdAt)}</div></Td>
                <Td className="text-sm">{p.customer.name}</Td>
                <Td className="num text-xs">{p.upiVpa ? maskVpa(p.upiVpa) : <span className="text-danger">Missing UPI</span>}</Td>
                <Td className="num text-right font-semibold">{formatINR(p.amountPaise)}</Td>
                <Td><StatusBadge map={payoutStatus} value={p.status} />{p.attemptCount > 1 && <div className="text-xs text-muted">{p.attemptCount} attempts</div>}</Td>
                <Td className="num text-xs text-muted">{p.utr ? `UTR ${p.utr}` : p.providerRef ?? "—"}</Td>
                <Td>
                  {["AWAITING_APPROVAL", "UNDER_REVIEW"].includes(p.status) && p.upiVpa && <ActionButton action={approvePayoutAction} fields={{ payoutId: p.id, andSend: "true" }} variant="primary">Approve & send</ActionButton>}
                  {p.status === "APPROVED" && <ActionButton action={initiatePayoutAction} fields={{ payoutId: p.id }} variant="primary">Send</ActionButton>}
                  {["FAILED", "REVERSED"].includes(p.status) && <ActionButton action={initiatePayoutAction} fields={{ payoutId: p.id }} confirm="Retry this payout with a new idempotent attempt?">Retry</ActionButton>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
