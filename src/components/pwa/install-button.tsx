"use client";

import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwa } from "./pwa-provider";

export function InstallButton({ variant = "secondary", className }: { variant?: "secondary" | "amber" | "outlineLight" | "ghost"; className?: string }) {
  const { canInstall, installed, install, isIos } = usePwa();
  if (installed) return null;
  if (canInstall)
    return (
      <Button variant={variant} size="sm" onClick={install} className={className}>
        <Download /> Install app
      </Button>
    );
  return (
    <Button variant={variant} size="sm" asChild className={className}>
      <Link href="/install">
        <Smartphone /> {isIos ? "Add to Home Screen" : "Get the app"}
      </Link>
    </Button>
  );
}
