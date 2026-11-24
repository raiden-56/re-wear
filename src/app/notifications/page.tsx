import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { ROLE_HOME } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { markAllRead } from "@/server/services/notifications";
import { EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireRole(["CUSTOMER", "COLLECTOR", "WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN", "B2B_BUYER", "RECYCLER_PARTNER", "DONATION_PARTNER"], "/notifications");
  const items = await db.notification.findMany({ where: { userId: user.id, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take: 60 });
  await markAllRead(user.id);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href={ROLE_HOME[user.role]} className="inline-flex items-center gap-1 text-sm text-muted hover:text-charcoal"><ArrowLeft className="size-4" /> Back</Link>
      <h1 className="mt-4 text-2xl font-bold">Notifications</h1>
      <div className="mt-6 space-y-2">
        {items.length === 0 && <EmptyState icon={Bell} title="All caught up" description="Pickup, valuation and payment updates will appear here." />}
        {items.map((n) => {
          const body = (
            <div className={`rounded-2xl border bg-white p-4 ${n.readAt ? "border-line" : "border-forest/30"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">{!n.readAt && <span className="mr-2 inline-block size-2 rounded-full bg-forest align-middle" />}{n.title}</div>
                <div className="shrink-0 text-xs text-muted">{formatDate(n.createdAt, true)}</div>
              </div>
              <p className="mt-1 text-sm text-muted">{n.body}</p>
            </div>
          );
          return n.link ? <Link key={n.id} href={n.link} className="block hover:opacity-90">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
      </div>
    </main>
  );
}
