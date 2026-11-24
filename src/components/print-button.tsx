"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} className="no-print">
      <Download /> {label}
    </Button>
  );
}
