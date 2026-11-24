import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Heart, RotateCcw, ShieldCheck, ShoppingBag, Star, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { addToCartAction, toggleWishlistAction } from "@/app/actions/shop";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Gallery } from "@/components/shop/gallery";
import { ProductCard } from "@/components/shop/product-card";
import { formatDate, formatINR, titleCase } from "@/lib/utils";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await db.marketplaceProduct.findFirst({
    where: { slug, status: { in: ["PUBLISHED", "SOLD_OUT"] }, deletedAt: null },
    include: { category: true, reviews: { where: { published: true }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, inventoryItem: { include: { inspections: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  if (!p) notFound();
  const user = await getCurrentUser();
  const [inCart, wished, related] = await Promise.all([
    user ? db.cartItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    db.marketplaceProduct.findMany({ where: { status: "PUBLISHED", categoryId: p.categoryId, id: { not: p.id } }, take: 4 }),
  ]);
  const available = p.status === "PUBLISHED" && p.quantity - p.reserved > 0;
  const avg = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0;
  const inspection = p.inventoryItem?.inspections[0];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav className="mb-6 text-sm text-muted"><Link href="/shop" className="hover:underline">Shop</Link> / <Link href={`/shop?category=${p.category.slug}`} className="hover:underline">{p.category.name}</Link></nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery photos={p.photoUrls} alt={p.name} />
        <div>
          <div className="text-sm uppercase tracking-wide text-muted">{p.brand}</div>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{p.name}</h1>
          {p.reviews.length > 0 && <div className="mt-2 flex items-center gap-1 text-sm"><Star className="size-4 fill-amber text-amber" /> {avg.toFixed(1)} · {p.reviews.length} verified review{p.reviews.length > 1 ? "s" : ""}</div>}
          <div className="num mt-5 flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold">{formatINR(p.pricePaise)}</span>
            {p.mrpPaise && <span className="text-lg text-muted line-through">{formatINR(p.mrpPaise)}</span>}
            {p.mrpPaise && <span className="rounded-full bg-forest-50 px-2 py-0.5 text-sm font-semibold text-forest">{Math.round((1 - p.pricePaise / p.mrpPaise) * 100)}% off new</span>}
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl bg-white p-3 ring-1 ring-line"><dt className="text-muted">Size</dt><dd className="font-semibold">{p.size}</dd></div>
            <div className="rounded-2xl bg-white p-3 ring-1 ring-line"><dt className="text-muted">Condition</dt><dd className="font-semibold">{titleCase(p.condition)}</dd></div>
            <div className="rounded-2xl bg-white p-3 ring-1 ring-line"><dt className="text-muted">For</dt><dd className="font-semibold">{p.gender ?? "Unisex"}</dd></div>
          </dl>
          <p className="mt-6 leading-relaxed text-charcoal/80">{p.description}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {available ? (
              inCart ? (
                <Button asChild size="lg"><Link href="/shop/cart"><ShoppingBag /> In your bag — checkout</Link></Button>
              ) : user ? (
                <ActionForm action={addToCartAction}><input type="hidden" name="productId" value={p.id} /><SubmitButton size="lg"><ShoppingBag /> Add to bag</SubmitButton></ActionForm>
              ) : (
                <Button asChild size="lg"><Link href={`/login?next=/shop/${p.slug}`}><ShoppingBag /> Sign in to buy</Link></Button>
              )
            ) : (
              <Button size="lg" disabled>{p.status === "SOLD_OUT" ? "Sold" : "Reserved by another shopper"}</Button>
            )}
            {user && (
              <ActionForm action={toggleWishlistAction}><input type="hidden" name="productId" value={p.id} /><SubmitButton size="lg" variant="secondary"><Heart className={wished ? "fill-danger text-danger" : ""} /> {wished ? "Saved" : "Save"}</SubmitButton></ActionForm>
            )}
          </div>
          <ul className="mt-8 space-y-3 border-t border-line pt-6 text-sm">
            <li className="flex gap-2.5"><BadgeCheck className="size-5 text-forest" /> Passed premium inspection{inspection ? ` on ${formatDate(inspection.createdAt)}` : ""}{inspection?.notes ? ` — ${inspection.notes}` : ""}</li>
            <li className="flex gap-2.5"><Truck className="size-5 text-forest" /> Ships in 2 days. Free shipping over ₹999.</li>
            <li className="flex gap-2.5"><RotateCcw className="size-5 text-forest" /> Cancel free before dispatch.</li>
            <li className="flex gap-2.5"><ShieldCheck className="size-5 text-forest" /> Secure payment — your item is reserved while you pay.</li>
          </ul>
        </div>
      </div>
      <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_2fr]">
        <div><h2 className="text-2xl font-bold">Verified reviews</h2><p className="mt-1 text-sm text-muted">Only buyers with a delivered order can review.</p></div>
        <div className="space-y-4">
          {p.reviews.length === 0 && <p className="text-muted">No reviews yet.</p>}
          {p.reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-center gap-1">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < r.rating ? "fill-amber text-amber" : "text-line"}`} />)}</div>
              {r.title && <div className="mt-2 font-semibold">{r.title}</div>}
              {r.body && <p className="mt-1 text-sm text-charcoal/80">{r.body}</p>}
              <div className="mt-2 text-xs text-muted">{r.user.name?.split(" ")[0]} · verified purchase · {formatDate(r.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>
      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="text-2xl font-bold">More {p.category.name.toLowerCase()}</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
        </div>
      )}
    </section>
  );
}
