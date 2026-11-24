import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Heart, Search, ShoppingBag } from "lucide-react";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { ProductCard } from "@/components/shop/product-card";
import { EmptyState } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Shop pre-loved" };

const PRICE = [["", "Any price"], ["0-500", "Under ₹500"], ["500-1000", "₹500 – ₹1,000"], ["1000-2500", "₹1,000 – ₹2,500"], ["2500-100000", "₹2,500+"]];

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; size?: string; price?: string; sort?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const [min, max] = (sp.price ?? "").split("-").map(Number);
  const where: Prisma.MarketplaceProductWhereInput = {
    status: { in: ["PUBLISHED", "SOLD_OUT"] },
    deletedAt: null,
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { brand: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }] } : {}),
    ...(sp.category ? { category: { slug: sp.category } } : {}),
    ...(sp.size ? { size: sp.size } : {}),
    ...(sp.price && !Number.isNaN(min) ? { pricePaise: { gte: min * 100, lte: max * 100 } } : {}),
  };
  const orderBy: Prisma.MarketplaceProductOrderByWithRelationInput[] = sp.sort === "price-asc" ? [{ pricePaise: "asc" }] : sp.sort === "price-desc" ? [{ pricePaise: "desc" }] : [{ status: "asc" }, { publishedAt: "desc" }];
  const [products, categories, sizes, cartCount] = await Promise.all([
    db.marketplaceProduct.findMany({ where, orderBy, take: 60 }),
    db.clothingCategory.findMany({ where: { products: { some: { status: "PUBLISHED" } } }, orderBy: { sortOrder: "asc" } }),
    db.marketplaceProduct.findMany({ where: { status: "PUBLISHED" }, distinct: ["size"], select: { size: true } }),
    user ? db.cartItem.count({ where: { userId: user.id } }) : 0,
  ]);
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Premium resale</p>
          <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Pre-loved, inspected, ready to wear.</h1>
          <p className="mt-2 max-w-xl text-muted">Every piece passed our premium quality inspection, was laundered, and is photographed as-is.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary"><Link href="/shop/wishlist"><Heart /> Wishlist</Link></Button>
          <Button asChild><Link href="/shop/cart"><ShoppingBag /> Bag {cartCount > 0 && <span className="num rounded-full bg-white/20 px-1.5 text-xs">{cartCount}</span>}</Link></Button>
        </div>
      </div>
      <form className="mt-8 grid gap-2 rounded-2xl border border-line bg-white p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input name="q" defaultValue={sp.q} placeholder="Search brand, item…" className="pl-9" aria-label="Search" /></div>
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</Select>
        <Select name="size" defaultValue={sp.size ?? ""} aria-label="Size"><option value="">Any size</option>{sizes.map((s) => <option key={s.size}>{s.size}</option>)}</Select>
        <Select name="price" defaultValue={sp.price ?? ""} aria-label="Price">{PRICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select name="sort" defaultValue={sp.sort ?? ""} aria-label="Sort"><option value="">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></Select>
        <Button type="submit">Filter</Button>
      </form>
      <div className="mt-8">
        {products.length === 0 ? (
          <EmptyState icon={Search} title="Nothing matches those filters" description="Try another size or category — new pieces are added every week." action={<Button asChild variant="secondary"><Link href="/shop">Clear filters</Link></Button>} />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        )}
      </div>
    </section>
  );
}
