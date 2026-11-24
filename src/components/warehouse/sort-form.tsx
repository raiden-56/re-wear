"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { sortBatchAction } from "@/app/actions/warehouse";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { gradeLabel } from "@/lib/labels";

const GRADES = ["PREMIUM_REUSABLE", "STANDARD_REUSABLE", "REPAIRABLE", "RECYCLABLE", "UPCYCLING", "REJECTED"];

export function SortForm({ batchId, unsortedGrams, categories, defaultCategoryId }: { batchId: string; unsortedGrams: number; categories: { id: string; name: string }[]; defaultCategoryId: string }) {
  const router = useRouter();
  const [lines, setLines] = React.useState([{ categoryId: defaultCategoryId, grade: "STANDARD_REUSABLE", kg: "" }]);
  const [finalize, setFinalize] = React.useState(true);
  const [pending, start] = React.useTransition();
  const total = lines.reduce((s, l) => s + Math.round((Number(l.kg) || 0) * 1000), 0);
  const remaining = unsortedGrams - total;
  const submit = () => {
    const fd = new FormData();
    fd.set("batchId", batchId);
    if (finalize) fd.set("finalize", "on");
    fd.set("lines", JSON.stringify(lines.filter((l) => Number(l.kg) > 0).map((l) => ({ ...l, kg: Number(l.kg) }))));
    start(async () => {
      const r = await sortBatchAction({ ok: false }, fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  };
  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2">
          <Select value={l.grade} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, grade: e.target.value } : y)))} aria-label="Grade">{GRADES.map((g) => <option key={g} value={g}>{gradeLabel[g].label}</option>)}</Select>
          <Select value={l.categoryId} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, categoryId: e.target.value } : y)))} aria-label="Category">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Input type="number" step="0.01" min="0" placeholder="kg" value={l.kg} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, kg: e.target.value } : y)))} className="num text-right" aria-label="Weight kg" />
          <button type="button" onClick={() => setLines((x) => x.filter((_, j) => j !== i))} disabled={lines.length === 1} className="p-2 text-muted disabled:opacity-30" aria-label="Remove line"><X className="size-4" /></button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => setLines((x) => [...x, { categoryId: defaultCategoryId, grade: "RECYCLABLE", kg: "" }])}><Plus /> Add line</Button>
      <div className={`num rounded-xl px-3 py-2 text-sm ${remaining < 0 ? "bg-danger-50 text-danger" : "bg-cream"}`}>Allocated {(total / 1000).toFixed(2)} kg · remaining unsorted {(remaining / 1000).toFixed(2)} kg</div>
      <Checkbox checked={finalize} onChange={(e) => setFinalize(e.target.checked)} label="Finalize batch (residual becomes sorting loss; large residuals need manager approval)" />
      <Button type="button" onClick={submit} disabled={pending || total <= 0 || remaining < 0}>{pending && <Loader2 className="animate-spin" />} Save sorting</Button>
    </div>
  );
}
