"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reinspectAction } from "@/app/actions/warehouse";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";

const g = (v: string) => Math.round((Number(v) || 0) * 1000);

/** Warehouse re-inspection → revised valuation that the customer must approve. */
export function ReinspectForm({ bookingId, categories }: { bookingId: string; categories: { id: string; name: string; grams: number }[] }) {
  const router = useRouter();
  const [gross, setGross] = React.useState("");
  const [tare, setTare] = React.useState("0");
  const [rejected, setRejected] = React.useState("0");
  const [rows, setRows] = React.useState(categories.map((c) => ({ ...c, kg: (c.grams / 1000).toFixed(2) })));
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const net = g(gross) - g(tare);
  const alloc = rows.reduce((s, r) => s + g(r.kg), 0) + g(rejected);
  const submit = () => {
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ bookingId, grossGrams: g(gross), tareGrams: g(tare), rejectedGrams: g(rejected), categoryWeights: rows.map((r) => ({ categoryId: r.id, grams: g(r.kg) })), reason }));
    start(async () => {
      const r = await reinspectAction({ ok: false }, fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <label>Gross kg<Input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} className="num mt-1" /></label>
        <label>Tare kg<Input type="number" step="0.01" value={tare} onChange={(e) => setTare(e.target.value)} className="num mt-1" /></label>
        <label>Rejected kg<Input type="number" step="0.01" value={rejected} onChange={(e) => setRejected(e.target.value)} className="num mt-1" /></label>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} className="grid grid-cols-[1fr_110px] items-center gap-2"><span>{r.name}</span><Input type="number" step="0.01" value={r.kg} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, kg: e.target.value } : y)))} className="num text-right" aria-label={`${r.name} kg`} /></div>
      ))}
      <p className="num text-muted">Net {(net / 1000).toFixed(2)} kg · allocated {(alloc / 1000).toFixed(2)} kg</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for revision (shown to customer)" rows={2} />
      <Button type="button" variant="amber" disabled={pending || net <= 0 || reason.length < 5} onClick={submit}>{pending && <Loader2 className="animate-spin" />} Send revised valuation for approval</Button>
    </div>
  );
}
