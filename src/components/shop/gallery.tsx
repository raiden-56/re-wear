"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [i, setI] = React.useState(0);
  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-cream-200">
        <Image src={photos[i]} alt={alt} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
      </div>
      {photos.length > 1 && (
        <div className="mt-3 flex gap-2">
          {photos.map((p, idx) => (
            <button key={p} type="button" onClick={() => setI(idx)} aria-label={`Photo ${idx + 1}`} className={cn("relative size-20 overflow-hidden rounded-xl ring-2", idx === i ? "ring-forest" : "ring-transparent")}>
              <Image src={p} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
