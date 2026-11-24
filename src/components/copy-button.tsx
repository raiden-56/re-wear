"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ title: "Join ReWear", text: "Sell your old clothes by the KG with free pickup:", url: value });
          else {
            await navigator.clipboard.writeText(value);
            toast.success("Copied");
          }
        } catch {
          /* user cancelled share */
        }
      }}
    >
      <Copy /> {label}
    </Button>
  );
}
