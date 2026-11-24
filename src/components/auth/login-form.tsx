"use client";

import * as React from "react";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { requestOtpAction, verifyOtpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

const phoneSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""))
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit Indian mobile number"),
});

export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const [sendState, sendAction, sending] = useActionState(requestOtpAction, { ok: false });
  const [verifyState, verifyAction, verifying] = useActionState(verifyOtpAction, { ok: false });
  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [cooldown, setCooldown] = React.useState(0);
  const form = useForm<z.input<typeof phoneSchema>>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: "" } });
  const phone = (sendState.data?.phone as string) ?? "";

  React.useEffect(() => {
    if (sendState.ok) {
      setStep("code");
      setCooldown(30);
    }
  }, [sendState.ts, sendState.ok]);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitPhone = form.handleSubmit((values) => {
    const fd = new FormData();
    fd.set("phone", values.phone as unknown as string);
    React.startTransition(() => sendAction(fd));
  });

  if (step === "code") {
    return (
      <form action={verifyAction} className="space-y-5">
        <button type="button" onClick={() => setStep("phone")} className="inline-flex items-center gap-1 text-sm text-muted hover:text-charcoal">
          <ArrowLeft className="size-4" /> Change number
        </button>
        <div>
          <h2 className="text-2xl font-bold">Enter the 6-digit code</h2>
          <p className="mt-1 text-sm text-muted">{sendState.message}</p>
        </div>
        {sendState.data?.demo === true && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-100 px-3 py-2.5 text-sm text-[#6b4813]">
            <Info className="mt-0.5 size-4 shrink-0" /> Demo account — use code <strong className="num">123456</strong>. (Development only.)
          </p>
        )}
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Verification code" htmlFor="code" error={verifyState.error}>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" autoFocus className="num h-14 text-center text-2xl tracking-[0.5em]" aria-invalid={!!verifyState.error} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={verifying}>
          {verifying && <Loader2 className="animate-spin" />} Verify & continue
        </Button>
        <button
          type="button"
          disabled={cooldown > 0 || sending}
          onClick={() => {
            const fd = new FormData();
            fd.set("phone", phone);
            React.startTransition(() => sendAction(fd));
          }}
          className="w-full text-sm font-medium text-forest disabled:text-muted"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submitPhone} className="space-y-5" noValidate>
        <div>
          <h2 className="text-2xl font-bold">Sign in or create an account</h2>
          <p className="mt-1 text-sm text-muted">We'll text you a one-time code. No passwords.</p>
        </div>
        <Field label="Mobile number" htmlFor="phone" error={form.formState.errors.phone?.message ?? sendState.error}>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-xl border border-r-0 border-line bg-cream px-3 text-sm text-muted">+91</span>
            <Input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" className="rounded-l-none" aria-invalid={!!form.formState.errors.phone} {...form.register("phone")} />
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={sending}>
          {sending && <Loader2 className="animate-spin" />} Send code
        </Button>
      </form>
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <a href={`/api/auth/google?next=${encodeURIComponent(next ?? "")}`}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" /></svg>
              Continue with Google
            </a>
          </Button>
        </>
      )}
    </div>
  );
}
