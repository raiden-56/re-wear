import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/guard";
import { db } from "@/server/db";
import { gradeLabel } from "@/lib/labels";
import { formatDate, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Tax invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const po = await db.purchaseOrder.findUnique({ where: { code: (await params).code }, include: { business: true, listing: { include: { category: true } } } });
  if (!po || !po.invoiceNumber || (po.business.userId !== user.id && !can(user, "b2b:manage"))) notFound();
  const taxable = po.totalPaise ?? 0;
  const gst = Math.round(taxable * 0.05); // HSN 6309 (worn clothing) — 5% GST
  const sameState = po.business.state?.toLowerCase() === "karnataka";
  return (
    <div className="mt-6 space-y-6 text-sm">
      <div className="flex justify-between">
        <div><h1 className="text-2xl font-bold">Tax invoice</h1><p className="num text-muted">{po.invoiceNumber}</p></div>
        <div className="text-right"><div>Date: {formatDate(po.confirmedAt)}</div><div className="num">PO {po.code}</div></div>
      </div>
      <div><div className="text-muted">Bill to</div><div className="font-semibold">{po.business.legalName}</div><div>{po.business.addressLine}, {po.business.city}, {po.business.state} {po.business.pincode}</div><div className="num">GSTIN {po.business.gstin ?? "Unregistered"}</div></div>
      <table className="w-full">
        <thead className="border-y border-line text-left text-xs uppercase text-muted"><tr><th className="py-2">Description</th><th className="py-2">HSN</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody><tr><td className="py-2">{po.listing.title} ({gradeLabel[po.listing.grade].label}, {po.listing.category.name})</td><td className="py-2">6309</td><td className="num py-2 text-right">{formatKg(po.requestedGrams)}</td><td className="num py-2 text-right">{formatINR(po.agreedPricePerKgPaise)}/kg</td><td className="num py-2 text-right">{formatINR(taxable)}</td></tr></tbody>
        <tfoot className="border-t border-line">
          {sameState ? (
            <><tr><td colSpan={4} className="py-1">CGST 2.5%</td><td className="num py-1 text-right">{formatINR(gst / 2)}</td></tr><tr><td colSpan={4} className="py-1">SGST 2.5%</td><td className="num py-1 text-right">{formatINR(gst / 2)}</td></tr></>
          ) : <tr><td colSpan={4} className="py-1">IGST 5%</td><td className="num py-1 text-right">{formatINR(gst)}</td></tr>}
          <tr className="text-base font-bold"><td colSpan={4} className="pt-2">Total</td><td className="num pt-2 text-right">{formatINR(taxable + gst)}</td></tr>
        </tfoot>
      </table>
      <p className="text-xs text-muted">Payment status: {po.paymentStatus.toLowerCase()}. Tax rates shown for HSN 6309; confirm with your accountant.</p>
    </div>
  );
}
