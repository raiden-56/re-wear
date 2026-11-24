"use client";

import { useActionState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { checkPincode } from "@/app/actions/public";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/forms/action-form";

export function PincodeChecker() {
  const [state, action] = useActionState(checkPincode, { ok: false });
  const serviceable = state.data?.serviceable as boolean | undefined;
  return (
    <form action={action} className="mt-3">
      <div className="flex gap-2">
        <Input name="pincode" inputMode="numeric" maxLength={6} placeholder="6-digit pincode" aria-label="Pincode" />
        <SubmitButton variant="secondary">Check</SubmitButton>
      </div>
      {state.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <p className={`mt-3 flex items-center gap-2 text-sm font-medium ${serviceable ? "text-forest" : "text-danger"}`} role="status">
          {serviceable ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {state.message}
        </p>
      )}
    </form>
  );
}
