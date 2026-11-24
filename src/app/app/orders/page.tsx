import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { orderStatus } from "@/lib/labels";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata = { title: "Shop orders" };

export default async function OrdersPage() {
  const user = await requireRole(["CUSTOMER"]);
  const orders = await db.marketplaceOrder.findMany({ where: { buyerId: user.id }, include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Shop orders" description="Pre-loved pieces you've bought from ReWear." actions={<Button asChild variant="secondary"><Link href="/shop"><ShoppingBag /> Shop</Link></Button>} />
      {orders.length === 0 ? <EmptyState icon={ShoppingBag} title="No orders yet" action={<Button asChild><Link href="/shop">Browse pre-loved</Link></Button>} /> : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/app/orders/${o.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-charcoal/25">
              <div className="flex -space-x-3">{o.items.slice(0, 3).map((i) => <div key={i.id} className="relative size-14 overflow-hidden rounded-xl ring-2 ring-white">{i.product.photoUrls[0] && <Image src={i.product.photoUrls[0]} alt="" fill sizes="56px" className="object-cover" />}</div>)}</div>
              <div className="flex-1"><div className="num font-semibold">{o.code}</div><div className="text-sm text-muted">{o.items.map((i) => i.name).join(", ")} · {formatDate(o.createdAt)}</div></div>
              <div className="text-right"><div className="num font-semibold">{formatINR(o.totalPaise)}</div><StatusBadge map={orderStatus} value={o.status} /></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
