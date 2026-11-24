import { Download, ShieldAlert } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { deleteAccountAction, updateProfileAction } from "@/app/actions/customer";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { maskPhone } from "@/lib/utils";

export const metadata = { title: "Profile & privacy" };

export default async function ProfilePage() {
  const user = await requireRole(["CUSTOMER"]);
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { customerProfile: true } });
  const p = u.customerProfile;
  return (
    <>
      <PageHeader title="Profile & privacy" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description={`Signed in with ${u.phone ? maskPhone(u.phone) : u.email}`} />
          <ActionForm action={updateProfileAction} className="space-y-4 p-5">
            <Field label="Name"><Input name="name" defaultValue={u.name ?? ""} /><FieldError name="name" /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={u.email ?? ""} /><FieldError name="email" /></Field>
            <Field label="Preferred language">
              <Select name="preferredLanguage" defaultValue={p?.preferredLanguage ?? "en"}>
                <option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option><option value="mr">मराठी</option><option value="te">తెలుగు</option><option value="ta">தமிழ்</option>
              </Select>
            </Field>
            <div className="space-y-3 rounded-2xl bg-cream p-4">
              <div className="text-sm font-semibold">Privacy & communication</div>
              <Checkbox name="whatsappOptIn" defaultChecked={p?.whatsappOptIn} label="Pickup and payment updates on WhatsApp" />
              <Checkbox name="marketingOptIn" defaultChecked={p?.marketingOptIn} label="Offers, rate changes and collection-drive news" />
              <Checkbox name="showOnLeaderboard" defaultChecked={p?.showOnLeaderboard} label="Show my first name on community impact leaderboards" />
            </div>
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-semibold">Your data</h3>
            <p className="mt-1 text-sm text-muted">Download a copy of everything ReWear holds about you (JSON).</p>
            <Button asChild variant="secondary" className="mt-4"><a href="/api/me/export"><Download /> Download my data</a></Button>
          </Card>
          <Card className="border-danger/30 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-danger"><ShieldAlert className="size-4" /> Delete account</h3>
            <p className="mt-1 text-sm text-muted">Deactivates your account and erases your personal details. Payment records required by law are kept in anonymised form. Open pickups and payouts must be completed first.</p>
            <ActionForm action={deleteAccountAction} className="mt-4 flex gap-2">
              <Input name="confirm" placeholder="Type DELETE" aria-label="Type DELETE to confirm" />
              <SubmitButton variant="danger">Delete</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
