"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { rescheduleAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Slot = { id: string; label: string; remaining: number; available: boolean };

export function RescheduleDialog({ bookingId, addressId, days }: { bookingId: string; addressId: string; days: { value: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(days[0]?.value);
  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [slotId, setSlotId] = React.useState("");
  React.useEffect(() => {
    if (!open || !date) return;
    setSlots(null);
    setSlotId("");
    fetch(`/api/pickup/slots?addressId=${addressId}&date=${date}`).then((r) => r.json()).then((b) => setSlots(b.slots ?? [])).catch(() => setSlots([]));
  }, [open, date, addressId]);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Reschedule pickup" description="Pick a new date and slot. Rescheduling is free." trigger={<Button variant="secondary" size="sm"><CalendarClock /> Reschedule</Button>}>
      <ActionForm action={rescheduleAction} onSuccess={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="pickupDate" value={date} />
        <input type="hidden" name="slotId" value={slotId} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button key={d.value} type="button" onClick={() => setDate(d.value)} className={cn("shrink-0 rounded-xl border-2 px-3 py-2 text-sm", date === d.value ? "border-forest bg-forest text-white" : "border-line")}>{d.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {slots === null ? <div className="skeleton col-span-2 h-14 rounded-xl" /> : slots.length === 0 ? <p className="col-span-2 text-sm text-muted">No slots this day.</p> : slots.map((s) => (
            <button key={s.id} type="button" disabled={!s.available} onClick={() => setSlotId(s.id)} className={cn("rounded-xl border-2 p-2.5 text-left text-sm disabled:opacity-50", slotId === s.id ? "border-forest bg-forest-50" : "border-line")}>
              <div className="font-semibold">{s.label}</div><div className="text-xs text-muted">{s.available ? `${s.remaining} left` : "Unavailable"}</div>
            </button>
          ))}
        </div>
        <SubmitButton disabled={!slotId} className="w-full">Confirm new time</SubmitButton>
      </ActionForm>
    </Dialog>
  );
}
