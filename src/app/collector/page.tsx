import Link from "next/link";
import { CheckCircle2, ChevronRight, ClipboardList, Clock, MapPin, Scale, XCircle } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { collectorDay, collectorProfileFor } from "@/server/services/collector-queries";
import { EmptyState, Notice, Stat, StatusBadge } from "@/components/ui/primitives";
import { bookingStatus, channelLabel } from "@/lib/labels";
import { formatKg } from "@/lib/utils";

export const metadata = { title: "Today" };

export default async function CollectorHome() {
  const user = await requireRole(["COLLECTOR"]);
  const profile = await collectorProfileFor(user.id);
  if (!profile) return <Notice tone="danger" title="No collector profile">Ask an administrator to set up your collector profile.</Notice>;
  const { bookings, kpi } = await collectorDay(profile.id);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{today} · {profile.serviceArea?.name ?? "No zone"}</p>
        <h1 className="text-2xl font-bold">Good day, {user.name?.split(" ")[0]}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Assigned" value={kpi.assigned} icon={ClipboardList} />
        <Stat label="Completed" value={kpi.completed} icon={CheckCircle2} tone="forest" />
        <Stat label="Pending" value={kpi.pending} icon={Clock} />
        <Stat label="KG collected" value={formatKg(kpi.grams, 1)} icon={Scale} />
        <Stat label="Failed" value={kpi.failed} icon={XCircle} />
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Today's route</h2>
        {bookings.length === 0 ? <EmptyState icon={ClipboardList} title="No pickups today" description="New assignments appear here automatically." /> : (
          <ol className="space-y-3">
            {bookings.map((b, i) => (
              <li key={b.id}>
                <Link href={`/collector/pickups/${b.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 active:scale-[0.99]">
                  <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-forest-50 text-sm font-bold text-forest">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{b.slot.label}</span><StatusBadge map={bookingStatus} value={b.status} /></div>
                    <div className="mt-0.5 truncate text-sm">{b.customer.name} · {channelLabel[b.channel]}</div>
                    <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted"><MapPin className="size-3 shrink-0" /> {b.address.line1}, {b.address.pincode}</div>
                    <div className="mt-0.5 text-xs text-muted">~{formatKg(b.estimatedGrams, 0)} · {b.bagCount} bag{b.bagCount > 1 ? "s" : ""} · {b.items.map((it) => it.category.name).join(", ")}</div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
