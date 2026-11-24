import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { costAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { todayIST } from "@/lib/dates";
import { formatDate, formatINR, titleCase } from "@/lib/utils";

export const metadata = { title: "Finance & ledger" };

export default async function FinancePage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [balances, entries] = await Promise.all([
    db.financialLedger.groupBy({ by: ["account", "direction"], _sum: { amountPaise: true } }),
    db.financialLedger.findMany({ orderBy: { createdAt: "desc" }, take: 80 }),
  ]);
  const accounts = [...new Set(balances.map((b) => b.account))].map((a) => {
    const dr = balances.find((b) => b.account === a && b.direction === "DEBIT")?._sum.amountPaise ?? 0;
    const cr = balances.find((b) => b.account === a && b.direction === "CREDIT")?._sum.amountPaise ?? 0;
    return { account: a, dr, cr };
  });
  const totalDr = accounts.reduce((s, a) => s + a.dr, 0);
  const totalCr = accounts.reduce((s, a) => s + a.cr, 0);
  return (
    <>
      <PageHeader title="Finance & ledger" description="Double-entry, idempotent journal for payouts, sales, refunds, settlements and internal costs." />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Trial balance" description={totalDr === totalCr ? "Balanced ✓ — debits equal credits" : "Out of balance — investigate"} />
          <Table>
            <thead><tr><Th>Account</Th><Th className="text-right">Debits</Th><Th className="text-right">Credits</Th><Th className="text-right">Net</Th></tr></thead>
            <tbody>
              {accounts.map((a) => <tr key={a.account}><Td className="font-medium">{titleCase(a.account)}</Td><Td className="num text-right">{formatINR(a.dr)}</Td><Td className="num text-right">{formatINR(a.cr)}</Td><Td className="num text-right font-semibold">{formatINR(a.dr - a.cr)}</Td></tr>)}
              <tr className="font-semibold"><Td>Total</Td><Td className="num text-right">{formatINR(totalDr)}</Td><Td className="num text-right">{formatINR(totalCr)}</Td><Td /></tr>
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Record an operating cost" description="Internal only — never charged to customers." />
          <ActionForm action={costAction} resetOnSuccess className="space-y-3 p-5">
            <Field label="Cost type"><Select name="account"><option value="LOGISTICS_COST">Logistics (fleet, fuel, drivers)</option><option value="SORTING_COST">Sorting</option><option value="PROCESSING_COST">Processing (laundry, baling)</option></Select></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Amount ₹"><Input name="amount" type="number" step="0.01" /></Field><Field label="Date"><Input name="costDate" type="date" defaultValue={todayIST()} /></Field></div>
            <Field label="City"><Input name="city" /></Field>
            <Field label="Description"><Input name="description" /></Field>
            <SubmitButton>Post to ledger</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Recent journal entries" />
        <Table>
          <thead><tr><Th>When</Th><Th>Account</Th><Th>Dr/Cr</Th><Th className="text-right">Amount</Th><Th>Reference</Th><Th>Description</Th></tr></thead>
          <tbody>{entries.map((e) => <tr key={e.id}><Td className="text-xs text-muted">{formatDate(e.createdAt, true)}</Td><Td className="text-sm">{titleCase(e.account)}</Td><Td className="text-xs">{e.direction}</Td><Td className="num text-right">{formatINR(e.amountPaise)}</Td><Td className="num text-xs">{titleCase(e.referenceType)}</Td><Td className="max-w-72 truncate text-sm">{e.description}</Td></tr>)}</tbody>
        </Table>
      </Card>
    </>
  );
}
