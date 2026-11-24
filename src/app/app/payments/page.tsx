import Link from "next/link";
import { BadgeCheck, IndianRupee, Receipt, ShieldCheck, Star, Trash2 } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { addUpiAction, removeUpiAction, setPrimaryUpiAction } from "@/app/actions/customer";
import { ActionButton, ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";
import { Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { payoutStatus } from "@/lib/labels";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const user = await requireRole(["CUSTOMER"]);
  const [accounts, payouts] = await Promise.all([
    db.upiAccount.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }),
    db.payout.findMany({ where: { customerId: user.id }, include: { booking: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const sum = (s: string[]) => payouts.filter((p) => s.includes(p.status)).reduce((a, p) => a + p.amountPaise, 0);
  return (
    <>
      <PageHeader title="Payments" description="Earnings are paid directly to your UPI ID — there's no wallet to withdraw from." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Paid to you" value={formatINR(sum(["SUCCESSFUL"]))} icon={BadgeCheck} tone="forest" />
        <Stat label="In progress" value={formatINR(sum(["AWAITING_APPROVAL", "APPROVED", "INITIATED", "PROCESSING", "UNDER_REVIEW"]))} icon={IndianRupee} />
        <Stat label="Needs attention" value={formatINR(sum(["FAILED", "REVERSED"]))} hint="We'll retry automatically" icon={IndianRupee} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader title="Your UPI IDs" description="Payouts go to your primary UPI ID." />
          <div className="space-y-3 p-5">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.vpa}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">{a.verified && <><BadgeCheck className="size-3.5 text-forest" /> Verified{a.nameAtBank ? ` · ${a.nameAtBank}` : ""}</>}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {a.isPrimary ? <span className="rounded-full bg-forest-50 px-2 py-0.5 text-xs font-semibold text-forest">Primary</span> : <ActionButton action={setPrimaryUpiAction} fields={{ id: a.id }} variant="ghost"><Star /> Make primary</ActionButton>}
                  <ActionButton action={removeUpiAction} fields={{ id: a.id }} variant="ghost" confirm="Remove this UPI ID?"><Trash2 /></ActionButton>
                </div>
              </div>
            ))}
            <ActionForm action={addUpiAction} resetOnSuccess className="space-y-2 pt-2">
              <label htmlFor="vpa" className="text-sm font-medium">Add a UPI ID</label>
              <div className="flex gap-2">
                <Input id="vpa" name="vpa" placeholder="yourname@okaxis" autoCapitalize="none" autoComplete="off" spellCheck={false} />
                <SubmitButton pendingText="Verifying…">Verify</SubmitButton>
              </div>
              <FieldError name="vpa" />
              <p className="flex items-start gap-1.5 text-xs text-muted"><ShieldCheck className="mt-px size-3.5 shrink-0 text-forest" /> We verify the ID with our payment partner. ReWear never asks for your UPI PIN.</p>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payout history" />
          {payouts.length === 0 ? (
            <div className="p-5"><EmptyState icon={IndianRupee} title="No payouts yet" description="After your first pickup is approved, your payment shows up here." /></div>
          ) : (
            <Table>
              <thead><tr><Th>Payout</Th><Th>Status</Th><Th className="text-right">Amount</Th><Th>Reference</Th><Th /></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} id={p.code}>
                    <Td><div className="font-medium">{p.booking.code}</div><div className="text-xs text-muted">{formatDate(p.createdAt)}</div></Td>
                    <Td><StatusBadge map={payoutStatus} value={p.status} />{p.failureReason && ["FAILED", "REVERSED", "UNDER_REVIEW"].includes(p.status) && <div className="mt-1 max-w-48 text-xs text-muted">{p.failureReason}</div>}</Td>
                    <Td className="num text-right font-semibold">{formatINR(p.amountPaise)}</Td>
                    <Td className="text-xs text-muted"><div className="num">{p.code}</div>{p.utr && <div className="num">UTR {p.utr}</div>}</Td>
                    <Td>{p.status === "SUCCESSFUL" && <Link href={`/receipts/payout/${p.code}`} className="inline-flex items-center gap-1 text-sm font-medium text-forest"><Receipt className="size-4" /> Receipt</Link>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
