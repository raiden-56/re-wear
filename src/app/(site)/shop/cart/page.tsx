import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { checkoutAction, removeFromCartAction } from "@/app/actions/shop";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/primitives";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Your bag" };

export default async function CartPage() {
  const user = await requireRole(["CUSTOMER"], "/shop/cart");
  const [items, addresses, cfg] = await Promise.all([
    db.cartItem.findMany({ where: { userId: user.id }, include: { product: true }, orderBy: { createdAt: "asc" } }),
    db.address.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { isDefault: "desc" } }),
    getSetting("marketplace"),
  ]);
  const subtotal = items.reduce((s, i) => s + i.product.pricePaise * i.quantity, 0);
  const shipping = subtotal >= cfg.freeShippingAbovePaise ? 0 : cfg.shippingFlatPaise;
  const unavailable = items.filter((i) => i.product.status !== "PUBLISHED" || i.product.quantity - i.product.reserved < i.quantity);
  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Your bag</h1>
      {items.length === 0 ? (
        <div className="mt-8"><EmptyState icon={ShoppingBag} title="Your bag is empty" action={<Button asChild><Link href="/shop">Browse pre-loved</Link></Button>} /></div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id} className="flex gap-4 rounded-2xl border border-line bg-white p-3">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-cream">{i.product.photoUrls[0] && <Image src={i.product.photoUrls[0]} alt="" fill sizes="96px" className="object-cover" />}</div>
                <div className="flex flex-1 flex-col">
                  <Link href={`/shop/${i.product.slug}`} className="font-medium hover:underline">{i.product.name}</Link>
                  <div className="text-sm text-muted">{i.product.brand} · Size {i.product.size}</div>
                  {unavailable.includes(i) && <div className="mt-1 text-xs font-medium text-danger">No longer available</div>}
                  <div className="mt-auto flex items-center justify-between"><span className="num font-semibold">{formatINR(i.product.pricePaise)}</span><ActionButton action={removeFromCartAction} fields={{ productId: i.productId }} variant="ghost"><Trash2 /> Remove</ActionButton></div>
                </div>
              </li>
            ))}
          </ul>
          <div className="h-fit space-y-4 rounded-3xl border border-line bg-white p-6">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="num">{formatINR(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd className="num">{shipping ? formatINR(shipping) : "Free"}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd className="num">{formatINR(subtotal + shipping)}</dd></div>
            </dl>
            {addresses.length === 0 ? (
              <Notice tone="warn">Add a delivery address first. <Link href="/app/addresses" className="font-semibold underline">Add address</Link></Notice>
            ) : (
              <ActionForm action={checkoutAction} className="space-y-3">
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Deliver to</legend>
                  {addresses.map((a, idx) => (
                    <label key={a.id} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 text-sm has-[:checked]:border-forest has-[:checked]:bg-forest-50">
                      <input type="radio" name="addressId" value={a.id} defaultChecked={idx === 0} className="mt-1 accent-[var(--forest)]" />
                      <span><span className="font-medium">{a.label}</span><br /><span className="text-muted">{a.line1}, {a.city} {a.pincode}</span></span>
                    </label>
                  ))}
                </fieldset>
                <SubmitButton size="lg" className="w-full" disabled={unavailable.length > 0}>Reserve & pay</SubmitButton>
                <p className="text-xs text-muted">Items are reserved for {cfg.reservationMinutes} minutes while you pay.</p>
              </ActionForm>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
