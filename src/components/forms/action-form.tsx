"use client";

import * as React from "react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionState = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown>; ts?: number };
export type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const ActionCtx = React.createContext<ActionState>({ ok: false });
export const useActionResult = () => React.useContext(ActionCtx);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  redirectTo,
  successToast = true,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: ActionState) => void;
  redirectTo?: string | ((s: ActionState) => string | undefined);
  successToast?: boolean;
}) {
  const [state, formAction] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state.ts) return;
    if (state.ok) {
      if (successToast && state.message) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      const to = typeof redirectTo === "function" ? redirectTo(state) : redirectTo;
      if (to) router.push(to);
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ts]);
  return (
    <ActionCtx.Provider value={state}>
      <form ref={ref} action={formAction} className={className} noValidate>
        {children}
      </form>
    </ActionCtx.Provider>
  );
}

export function SubmitButton({ children, className, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function FieldError({ name }: { name: string }) {
  const s = useActionResult();
  const msg = s.fieldErrors?.[name];
  return msg ? <p className="mt-1.5 text-sm text-danger">{msg}</p> : null;
}

/** One-click mutation button (with optional confirmation). */
export function ActionButton({
  action,
  fields = {},
  children,
  confirm,
  className,
  variant = "secondary",
  size = "sm",
  redirectTo,
}: {
  action: ServerAction;
  fields?: Record<string, string | number>;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  redirectTo?: string;
}) {
  return (
    <ActionForm action={action} className={cn("inline-flex", className)} redirectTo={redirectTo}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <SubmitButton
        variant={variant}
        size={size}
        onClick={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
