"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, createSession, destroySession, getCurrentUser } from "@/server/auth/session";
import { requestOtp, verifyOtp } from "@/server/auth/otp";
import { canAccessPortal, ROLE_HOME, type RoleKey } from "@/server/auth/permissions";
import { authedAction, formToObject, toActionError, zs, type ActionState } from "@/server/action";
import { completeOnboarding, upsertUserByPhone } from "@/server/services/accounts";
import { enforceRateLimit } from "@/server/rate-limit";
import { demoOtpEnabled } from "@/server/env";

/** Only allow same-site relative redirects the role can actually open. */
function safeNext(next: unknown, role: RoleKey) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return ROLE_HOME[role];
  return canAccessPortal(role, next) ? next : ROLE_HOME[role];
}

export async function requestOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const phone = z.string().min(10, "Enter your mobile number").parse(fd.get("phone"));
    const r = await requestOtp(phone, await clientIp());
    return {
      ok: true,
      message: `Code sent to ${r.phone.replace(/^(\+91)(\d{2})\d{5}(\d{3})$/, "$1 $2•••••$3")}`,
      data: { phone: r.phone, demo: r.demo && demoOtpEnabled() },
      ts: Date.now(),
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let destination = "/";
  try {
    const input = z.object({ phone: z.string(), code: z.string().trim(), next: z.string().optional() }).parse(formToObject(fd));
    await enforceRateLimit(`otp-verify:${await clientIp()}`, 30, 900);
    const phone = await verifyOtp(input.phone, input.code);
    const { user, isNew } = await upsertUserByPhone(phone);
    await createSession(user.id);
    const role = user.role.key as RoleKey;
    const next = safeNext(input.next, role);
    destination = isNew || (!user.name && role === "CUSTOMER") ? `/onboarding?next=${encodeURIComponent(next)}` : next;
  } catch (e) {
    return toActionError(e);
  }
  redirect(destination);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export const onboardingAction = authedAction(
  z.object({
    name: zs.req(80, "Tell us your name").refine((v) => v.length >= 2, "Tell us your name"),
    email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
    referralCode: zs.optional(20),
    marketingOptIn: zs.bool,
    next: z.string().optional(),
  }),
  async (user, input) => {
    await completeOnboarding(user, { name: input.name, email: input.email || null, referralCode: input.referralCode, marketingOptIn: input.marketingOptIn });
    redirect(safeNext(input.next, user.role));
  },
);

export async function currentUserHome() {
  const u = await getCurrentUser();
  return u ? ROLE_HOME[u.role] : null;
}
