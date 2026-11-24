"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Scale, X } from "lucide-react";
import { toast } from "sonner";
import { recordWeighingAction } from "@/app/actions/collector";
import { PhotoUploader, type Uploaded } from "@/components/forms/photo-uploader";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string };
const g = (kg: string) => Math.round((Number(kg) || 0) * 1000);

/**
 * Digital weighing at the doorstep. Collectors enter weights only — rates and payout
 * amounts are computed on the server from the booking's locked pricing snapshot.
 */
export function WeighingForm({ bookingId, initialCats, allCats, tolerance }: { bookingId: string; initialCats: Cat[]; allCats: Cat[]; tolerance: number }) {
  const router = useRouter();
  const [gross, setGross] = React.useState("");
  const [tare, setTare] = React.useState("");
  const [rejected, setRejected] = React.useState("0");
  const [rows, setRows] = React.useState(initialCats.map((c) => ({ ...c, kg: "" })));
  const [scale, setScale] = React.useState<Uploaded[]>([]);
  const [evidence, setEvidence] = React.useState<Uploaded[]>([]);
  const [pending, start] = React.useTransition();

  const net = g(gross) - g(tare);
  const allocated = rows.reduce((s, r) => s + g(r.kg), 0) + g(rejected);
  const diff = allocated - net;
  const balanced = net > 0 && Math.abs(diff) <= tolerance;
  const addable = allCats.filter((c) => !rows.some((r) => r.id === c.id));

  const submit = () => {
    if (!scale.length) return toast.error("Capture a photo of the scale reading.");
    if (!balanced) return toast.error("Category weights must add up to the net weight.");
    const payload = { bookingId, grossGrams: g(gross), tareGrams: g(tare), rejectedGrams: g(rejected), categoryWeights: rows.map((r) => ({ categoryId: r.id, grams: g(r.kg) })), scalePhotoKey: scale[0].key, evidenceKeys: evidence.map((e) => e.key) };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    start(async () => {
      const r = await recordWeighingAction({ ok: false }, fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const kgInput = (value: string, onChange: (v: string) => void, label: string) => (
    <Input type="number" inputMode="decimal" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="num h-12 text-right text-lg" placeholder="0.00" />
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5"><span className="text-sm font-medium">Gross weight (kg)</span>{kgInput(gross, setGross, "Gross weight in kg")}<span className="block text-xs text-muted">Clothes + bags</span></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Tare weight (kg)</span>{kgInput(tare, setTare, "Tare weight in kg")}<span className="block text-xs text-muted">Empty bags / containers</span></label>
      </div>
      <div className={cn("flex items-center justify-between rounded-2xl p-4", net > 0 ? "bg-forest text-white" : "bg-cream")}>
        <span className="flex items-center gap-2 font-medium"><Scale className="size-5" /> Net weight</span>
        <span className="num font-display text-2xl font-bold">{net > 0 ? (net / 1000).toFixed(2) : "0.00"} kg</span>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Weight by category</div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
              <span className="text-sm">{r.name}</span>
              {kgInput(r.kg, (v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, kg: v } : y))), `${r.name} kg`)}
              <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove ${r.name}`} className="rounded-lg p-2 text-muted disabled:opacity-30"><X className="size-4" /></button>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
            <span className="text-sm text-danger">Not accepted (wet / soiled)</span>
            {kgInput(rejected, setRejected, "Rejected weight in kg")}
            <span className="w-8" />
          </div>
        </div>
        {addable.length > 0 && (
          <div className="mt-3 flex gap-2">
            <Select aria-label="Add category" id="add-cat" defaultValue="">
              <option value="" disabled>Add another category…</option>
              {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button type="button" variant="secondary" onClick={() => {
              const sel = document.getElementById("add-cat") as HTMLSelectElement;
              const c = addable.find((x) => x.id === sel.value);
              if (c) setRows((x) => [...x, { ...c, kg: "" }]);
            }}><Plus /> Add</Button>
          </div>
        )}
        <div className={cn("mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm", net <= 0 ? "bg-cream text-muted" : balanced ? "bg-forest-50 text-forest" : "bg-amber-100 text-[#6b4813]")}>
          {balanced ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {net <= 0 ? "Enter gross and tare first." : balanced ? "Category weights match the net weight." : `${(Math.abs(diff) / 1000).toFixed(2)} kg ${diff > 0 ? "over" : "still to allocate"}.`}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Digital scale photo <span className="text-danger">*</span></div>
        <PhotoUploader purpose="SCALE_PHOTO" value={scale} onChange={setScale} max={1} capture label="Scale photo" required />
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">Collection evidence (optional)</div>
        <PhotoUploader purpose="COLLECTION_EVIDENCE" value={evidence} onChange={setEvidence} max={6} capture />
      </div>
      <Button type="button" size="lg" className="w-full" disabled={pending || !balanced || !scale.length} onClick={submit}>
        {pending && <Loader2 className="animate-spin" />} Save weights & send valuation
      </Button>
      <p className="text-center text-xs text-muted">Rates are locked from the booking — the customer sees the amount instantly.</p>
    </div>
  );
}
