import Image from "next/image";
import Link from "next/link";
import { formatINR, titleCase } from "@/lib/utils";

export function ProductCard({ p }: { p: { slug: string; name: string; brand: string | null; photoUrls: string[]; pricePaise: number; mrpPaise: number | null; size: string; condition: string; status: string } }) {
  const off = p.mrpPaise ? Math.round((1 - p.pricePaise / p.mrpPaise) * 100) : 0;
  return (
    <Link href={`/shop/${p.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-cream-200">
        {p.photoUrls[0] && <Image src={p.photoUrls[0]} alt={p.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">{titleCase(p.condition)}</span>
        {p.status === "SOLD_OUT" && <span className="absolute inset-0 grid place-items-center bg-white/60 font-display text-lg font-bold">Sold</span>}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs uppercase tracking-wide text-muted">{p.brand ?? "Pre-loved"}</div>
          <div className="truncate font-medium">{p.name}</div>
          <div className="text-xs text-muted">Size {p.size}</div>
        </div>
        <div className="num shrink-0 text-right">
          <div className="font-semibold">{formatINR(p.pricePaise, { whole: true })}</div>
          {p.mrpPaise && <div className="text-xs text-muted"><span className="line-through">{formatINR(p.mrpPaise, { whole: true })}</span> <span className="text-forest">{off}% off</span></div>}
        </div>
      </div>
    </Link>
  );
}
