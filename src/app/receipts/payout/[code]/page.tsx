import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/guard";
import { db } from "@/server/db";
import { formatDate, formatINR, formatKg, maskVpa } from "@/lib/utils";

export const metadata = { title: "Payment receipt" };

type Line = { name: string; grams: number; ratePaisePerKg: number; subtotalPaise: number };

export default async function PayoutReceipt({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const { code } = await params;
  const p = await db.payout.findUnique({ where: { code }, include: { booking: { include: { address: true } }, customer: true } });
  if (!p || (p.customerId !== user.id && !can(user, "payout:read:any"))) notFound();
  const v = await db.valuation.findUniqueOrThrow({ where: { id: p.valuationId } });
  const lines = v.lines as Line[];
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment receipt</h1>
          <p className="num text-sm text-muted">{p.code}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${p.status === "SUCCESSFUL" ? "bg-forest-50 text-forest" : "bg-amber-100 text-[#7a5317]"}`}>{p.status === "SUCCESSFUL" ? "PAID" : p.status.replace(/_/g, " ")}</div>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-muted">Paid to</dt><dd className="font-medium">{p.customer.name}</dd><dd className="num text-muted">{maskVpa(p.upiVpa)}</dd></div>
        <div><dt className="text-muted">Booking</dt><dd className="num font-medium">{p.booking.code}</dd><dd className="text-muted">{p.booking.address.city}</dd></div>
        <div><dt className="text-muted">Payment date</dt><dd className="font-medium">{formatDate(p.completedAt ?? p.createdAt, true)}</dd></div>
        <div><dt className="text-muted">Bank reference (UTR)</dt><dd className="num font-medium">{p.utr ?? "—"}</dd><dd className="num text-xs text-muted">{p.providerRef}</dd></div>
      </dl>
      <table className="w-full text-sm">
        <thead className="border-y border-line text-left text-xs uppercase text-muted"><tr><th className="py-2">Category</th><th className="py-2 text-right">Weight</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody className="divide-y divide-line/60">
          {lines.map((l) => <tr key={l.name}><td className="py-2">{l.name}</td><td className="num py-2 text-right">{formatKg(l.grams)}</td><td className="num py-2 text-right">{formatINR(l.ratePaisePerKg)}/kg</td><td className="num py-2 text-right">{formatINR(l.subtotalPaise)}</td></tr>)}
        </tbody>
        <tfoot className="border-t-2 border-charcoal/20">
          <tr><td colSpan={3} className="py-1.5 text-muted">Gross {formatKg(v.grossGrams)} − tare {formatKg(v.tareGrams)} = net {formatKg(v.netGrams)}</td><td /></tr>
          {v.deductionPaise > 0 && <tr><td colSpan={3} className="py-1.5">Deductions</td><td className="num py-1.5 text-right">− {formatINR(v.deductionPaise)}</td></tr>}
          <tr><td colSpan={3} className="py-1.5">Pickup charge</td><td className="num py-1.5 text-right">₹0.00</td></tr>
          <tr className="text-base font-bold"><td colSpan={3} className="pt-2">Total paid</td><td className="num pt-2 text-right">{formatINR(p.amountPaise)}</td></tr>
        </tfoot>
      </table>
      <p className="text-xs text-muted">Valuation v{v.version} approved on {v.approvedAt ? formatDate(v.approvedAt, true) : "—"}. Paid by direct UPI transfer; ReWear holds no wallet balance on your behalf.</p>
    </div>
  );
}
