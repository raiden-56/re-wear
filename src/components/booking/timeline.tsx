import { formatDate, titleCase } from "@/lib/utils";

const LABELS: Record<string, string> = {
  CREATED: "Booking confirmed — free pickup",
  ASSIGNED: "Collector assigned",
  REASSIGNED: "Collector changed",
  RESCHEDULED: "Rescheduled",
  EN_ROUTE: "Collector on the way",
  ARRIVED: "Collector arrived",
  OTP_VERIFIED: "Booking code verified",
  WEIGHED: "Clothes weighed",
  VALUATION_SENT: "Valuation shared",
  VALUATION_APPROVED: "Valuation approved",
  VALUATION_REJECTED: "Valuation rejected",
  COMPLETED: "Pickup completed",
  CANCELLED: "Cancelled",
  FAILED: "Pickup failed",
  RECEIVED_AT_WAREHOUSE: "Received at sorting hub",
  NOTE: "Note",
};

export function Timeline({ events }: { events: { id: string; type: string; note: string | null; createdAt: Date; meta?: unknown }[] }) {
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e, i) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[1.6rem] top-1 size-2.5 rounded-full ring-4 ring-white ${i === events.length - 1 ? "bg-forest" : "bg-sage"}`} />
          <div className="text-sm font-medium">{LABELS[e.type] ?? titleCase(e.type)}</div>
          {e.note && <div className="text-sm text-muted">{e.note}</div>}
          <div className="text-xs text-muted">{formatDate(e.createdAt, true)}</div>
        </li>
      ))}
    </ol>
  );
}
