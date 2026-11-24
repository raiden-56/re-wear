import { PackageOpen } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { receiveBatchAction } from "@/app/actions/warehouse";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input, Select } from "@/components/ui/form";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { channelLabel } from "@/lib/labels";
import { formatDate, formatKg } from "@/lib/utils";

export const metadata = { title: "Receiving" };

export default async function ReceivingPage() {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const [bookings, warehouses] = await Promise.all([
    db.booking.findMany({
      where: { status: "COMPLETED", batch: null, channel: { not: "DONATION" } },
      include: { serviceArea: true, weighings: { orderBy: { createdAt: "desc" }, take: 1 }, assignments: { orderBy: { assignedAt: "desc" }, take: 1, include: { collector: { include: { user: true } } } } },
      orderBy: { completedAt: "asc" },
    }),
    db.warehouseLocation.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Collection receiving" description="Re-weigh each completed pickup on arrival. One batch per booking — duplicates are blocked." />
      {bookings.length === 0 ? <EmptyState icon={PackageOpen} title="Nothing in transit" description="Completed pickups appear here until they are received." /> : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const w = b.weighings[0];
            const collected = w ? w.netGrams - w.rejectedGrams : 0;
            const defaultWh = warehouses.find((x) => x.city === b.serviceArea.city)?.id ?? warehouses[0]?.id;
            return (
              <Card key={b.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="num font-semibold">{b.code}</div>
                    <div className="text-sm text-muted">{channelLabel[b.channel]} · {b.serviceArea.name} · collected {formatDate(b.completedAt, true)}</div>
                    <div className="text-sm text-muted">Collector: {b.assignments[0]?.collector.user.name ?? "—"}</div>
                    <div className="num mt-1 text-sm">Accepted at doorstep: <strong>{formatKg(collected)}</strong></div>
                  </div>
                  <ActionForm action={receiveBatchAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <label className="text-xs text-muted">Warehouse<Select name="warehouseId" defaultValue={defaultWh} className="mt-1 h-10 w-48">{warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.code} · {wh.city}</option>)}</Select></label>
                    <label className="text-xs text-muted">Received kg<Input name="receivedKg" type="number" step="0.01" defaultValue={(collected / 1000).toFixed(2)} className="num mt-1 h-10 w-28" /></label>
                    <SubmitButton>Receive batch</SubmitButton>
                  </ActionForm>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
