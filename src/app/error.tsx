"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted">Your data is safe. Please try again — if it keeps happening, contact support{error.digest ? ` with reference ${error.digest}` : ""}.</p>
      <Button onClick={reset} className="mt-6"><RotateCcw /> Try again</Button>
    </main>
  );
}
