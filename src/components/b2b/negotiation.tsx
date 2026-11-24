import { formatDate, formatINR, formatKg } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Negotiation({ offers, viewerSide }: { offers: { id: string; byRole: string; pricePerKgPaise: number; grams: number; message: string | null; createdAt: Date }[]; viewerSide: "BUYER" | "REWEAR" }) {
  return (
    <ul className="space-y-3">
      {offers.map((o) => (
        <li key={o.id} className={cn("max-w-[85%] rounded-2xl p-3.5 text-sm", o.byRole === viewerSide ? "ml-auto bg-forest text-white" : "bg-cream")}>
          <div className="text-xs opacity-70">{o.byRole === "BUYER" ? "Buyer" : "ReWear"} · {formatDate(o.createdAt, true)}</div>
          <div className="num mt-1 font-semibold">{formatINR(o.pricePerKgPaise)}/kg × {formatKg(o.grams, 0)} = {formatINR(Math.round((o.pricePerKgPaise * o.grams) / 1000))}</div>
          {o.message && <p className="mt-1">{o.message}</p>}
        </li>
      ))}
    </ul>
  );
}
