import Link from "next/link";
import { Heart } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { ProductCard } from "@/components/shop/product-card";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const user = await requireRole(["CUSTOMER"], "/shop/wishlist");
  const items = await db.wishlistItem.findMany({ where: { userId: user.id }, include: { product: true }, orderBy: { createdAt: "desc" } });
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Wishlist</h1>
      <div className="mt-8">
        {items.length === 0 ? <EmptyState icon={Heart} title="Nothing saved yet" action={<Button asChild><Link href="/shop">Browse pre-loved</Link></Button>} /> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{items.map((i) => <ProductCard key={i.id} p={i.product} />)}</div>}
      </div>
    </section>
  );
}
