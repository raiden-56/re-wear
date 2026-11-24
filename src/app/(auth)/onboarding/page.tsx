import { redirect } from "next/navigation";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { onboardingAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string; ref?: string }> }) {
  const { next, ref } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { referredBy: true } });
  return (
    <ActionForm action={onboardingAction} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Welcome to ReWear</h1>
        <p className="mt-1 text-sm text-muted">A couple of details so collectors know who to ask for.</p>
      </div>
      <input type="hidden" name="next" value={next ?? "/app"} />
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" defaultValue={full.name ?? ""} autoComplete="name" required autoFocus /><FieldError name="name" /></Field>
      <Field label="Email (optional)" htmlFor="email" hint="For receipts and order updates."><Input id="email" name="email" type="email" defaultValue={full.email ?? ""} autoComplete="email" /><FieldError name="email" /></Field>
      {!full.referredBy && <Field label="Referral code (optional)" htmlFor="referralCode"><Input id="referralCode" name="referralCode" defaultValue={ref ?? ""} className="uppercase" /></Field>}
      <Checkbox name="marketingOptIn" label="Send me rate updates and collection-drive news. You can opt out any time." />
      <SubmitButton size="lg" className="w-full">Continue</SubmitButton>
    </ActionForm>
  );
}
