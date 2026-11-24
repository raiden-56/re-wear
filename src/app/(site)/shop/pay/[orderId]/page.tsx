import { notFound, redirect } from "next/navigation";
import { Clock, CreditCard, ShieldCheck } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { sandboxPayAction } from "@/app/actions/shop";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { RazorpayCheckout } from "@/components/shop/razorpay-checkout";
import { Notice } from "@/components/ui/primitives";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requireRole(["CUSTOMER"], "/shop/cart");
  const order = await db.marketplaceOrder.findFirst({ where: { id: (await params).orderId, buyerId: user.id }, include: { items: true } });
  if (!order) notFound();
  if (order.status !== "PENDING_PAYMENT") redirect(`/app/orders/${order.id}`);
  const e = env();
  const minutes = order.reservedUntil ? Math.max(0, Math.round((order.reservedUntil.getTime() - Date.now()) / 60000)) : 0;
  return (
    <section className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-3xl border border-line bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Complete payment</h1>
        <p className="num mt-1 text-sm text-muted">Order {order.code}</p>
        <ul className="mt-6 divide-y divide-line text-sm">
          {order.items.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.name}</span><span className="num">{formatINR(i.pricePaise)}</span></li>)}
          <li className="flex justify-between py-2"><span className="text-muted">Shipping</span><span className="num">{order.shippingPaise ? formatINR(order.shippingPaise) : "Free"}</span></li>
          <li className="flex justify-between py-2 text-base font-semibold"><span>Total</span><span className="num">{formatINR(order.totalPaise)}</span></li>
        </ul>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Clock className="size-4" /> Reserved for you for {minutes} more minute{minutes === 1 ? "" : "s"}.</p>
        {e.PAYMENT_PROVIDER === "razorpay" ? (
          <RazorpayCheckout orderId={order.id} orderRef={order.paymentRef!} amountPaise={order.totalPaise} keyId={e.RAZORPAY_KEY_ID!} name={user.name ?? ""} />
        ) : (
          <div className="mt-6 space-y-3">
            <Notice tone="info" title="Sandbox payment gateway">Development mode — no real money moves. Choose an outcome to simulate the bank's response.</Notice>
            <ActionForm action={sandboxPayAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="outcome" value="success" />
              <SubmitButton size="lg" className="w-full"><CreditCard /> Pay {formatINR(order.totalPaise)}</SubmitButton>
            </ActionForm>
            <ActionForm action={sandboxPayAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="outcome" value="failure" />
              <SubmitButton variant="ghost" className="w-full">Simulate a declined payment</SubmitButton>
            </ActionForm>
          </div>
        )}
        <p className="mt-6 flex items-center gap-2 text-xs text-muted"><ShieldCheck className="size-4 text-forest" /> Payments are verified server-side with a signed confirmation before your order is accepted.</p>
      </div>
    </section>
  );
}
