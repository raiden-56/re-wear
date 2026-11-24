"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { verifyArrivalAction } from "@/app/actions/collector";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input } from "@/components/ui/form";

/** Verifies the customer's 4-digit code and records the collector's location. */
export function ArrivalForm({ bookingId }: { bookingId: string }) {
  const [coords, setCoords] = React.useState<{ lat?: number; lng?: number }>({});
  React.useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }), () => null, { timeout: 8000 });
  }, []);
  return (
    <ActionForm action={verifyArrivalAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      {coords.lat && <input type="hidden" name="lat" value={coords.lat} />}
      {coords.lng && <input type="hidden" name="lng" value={coords.lng} />}
      <label htmlFor="code" className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-forest" /> Ask the customer for their 4-digit booking code</label>
      <Input id="code" name="code" inputMode="numeric" maxLength={4} autoComplete="off" className="num h-14 text-center text-3xl tracking-[0.6em]" />
      <SubmitButton size="lg" className="w-full">Verify & start collection</SubmitButton>
    </ActionForm>
  );
}
