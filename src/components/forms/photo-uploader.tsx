"use client";

import * as React from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type Uploaded = { key: string; url: string };

/** Uploads images to private storage; returns storage keys (never public URLs). */
export function PhotoUploader({
  purpose,
  value,
  onChange,
  max = 6,
  label = "Add photos",
  capture,
  name,
  required,
}: {
  purpose: string;
  value: Uploaded[];
  onChange: (v: Uploaded[]) => void;
  max?: number;
  label?: string;
  capture?: boolean;
  name?: string;
  required?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next = [...value];
    for (const f of Array.from(files).slice(0, max - value.length)) {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("purpose", purpose);
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed");
        next.push(body);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((p) => (
          <div key={p.key} className="relative size-20 overflow-hidden rounded-xl border border-line bg-cream">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="size-full object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => onChange(value.filter((v) => v.key !== p.key))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-charcoal/70 text-white">
              <X className="size-3.5" />
            </button>
            {name && <input type="hidden" name={name} value={p.key} />}
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={cn("flex size-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-medium transition-colors", required && value.length === 0 ? "border-amber text-[#7a5317]" : "border-line text-muted hover:border-forest hover:text-forest")}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            {busy ? "Uploading" : label}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} {...(capture ? { capture: "environment" } : {})} className="hidden" onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
