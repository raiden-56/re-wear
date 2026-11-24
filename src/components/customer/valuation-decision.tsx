"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { respondValuationAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";

export function ValuationDecision({ bookingId, valuationId, rejectionFlow }: { bookingId: string; valuationId: string; rejectionFlow: "DISPUTE" | "RETURN" }) {
  const [rejecting, setRejecting] = React.useState(false);
  if (rejecting)
    return (
      <ActionForm action={respondValuationAction} className="space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="valuationId" value={valuationId} />
        <input type="hidden" name="decision" value="REJECT" />
        <label className="block text-sm font-medium" htmlFor="reason">What doesn't look right?</label>
        <Textarea id="reason" name="reason" required placeholder="e.g. The jeans weighed more on my home scale." />
        <p className="text-xs text-muted">{rejectionFlow === "RETURN" ? "If you reject at your doorstep, the collector will leave your clothes with you." : "Our team will review the scale photos and contact you. Nothing is paid until it's resolved."}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
          <SubmitButton variant="danger"><X /> Reject valuation</SubmitButton>
        </div>
      </ActionForm>
    );
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <ActionForm action={respondValuationAction} className="flex-1">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="valuationId" value={valuationId} />
        <input type="hidden" name="decision" value="APPROVE" />
        <SubmitButton size="lg" className="w-full"><Check /> Approve valuation</SubmitButton>
      </ActionForm>
      <Button type="button" size="lg" variant="secondary" onClick={() => setRejecting(true)}>Something's wrong</Button>
    </div>
  );
}
