import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Recycle } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { registerBusinessAction, registerRecyclerAction } from "@/app/actions/partners";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/primitives";
import { businessTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Partner registration" };

export default async function PartnerRegister({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const type = (await searchParams).type === "recycler" ? "recycler" : "business";
  const user = await requireRole(["CUSTOMER", "B2B_BUYER", "RECYCLER_PARTNER"], `/partners/register?type=${type}`);
  if (user.role === "B2B_BUYER") redirect("/business");
  if (user.role === "RECYCLER_PARTNER") redirect("/recycler");
  const bookings = await db.booking.count({ where: { customerId: user.id } });
  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">Become a ReWear partner</h1>
      <p className="mt-2 text-muted">Accounts are verified by our team before you can place orders — usually within one working day.</p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link href="/partners/register?type=business" className={cn("flex items-center gap-2 rounded-2xl border-2 p-4 font-semibold", type === "business" ? "border-forest bg-white" : "border-line")}><Building2 className="size-5 text-forest" /> Business buyer</Link>
        <Link href="/partners/register?type=recycler" className={cn("flex items-center gap-2 rounded-2xl border-2 p-4 font-semibold", type === "recycler" ? "border-forest bg-white" : "border-line")}><Recycle className="size-5 text-forest" /> Textile recycler</Link>
      </div>
      {bookings > 0 && <Notice tone="warn" className="mt-6">This number already has customer pickups. Please sign in with a separate business mobile number.</Notice>}
      <div className="mt-6 rounded-3xl border border-line bg-white p-6">
        {type === "business" ? (
          <ActionForm action={registerBusinessAction} className="space-y-4">
            <Field label="Legal business name"><Input name="legalName" /><FieldError name="legalName" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trade name (optional)"><Input name="tradeName" /></Field>
              <Field label="Business type"><Select name="businessType">{Object.entries(businessTypeLabel).filter(([k]) => k !== "TEXTILE_RECYCLER").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="GSTIN" hint="15 characters, e.g. 29ABCDE1234F1Z5"><Input name="gstin" className="uppercase" maxLength={15} /></Field>
              <Field label="PAN (optional)"><Input name="pan" className="uppercase" maxLength={10} /></Field>
            </div>
            <Field label="Business email"><Input name="contactEmail" type="email" /><FieldError name="contactEmail" /></Field>
            <Field label="Registered address"><Input name="addressLine" /><FieldError name="addressLine" /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City"><Input name="city" /></Field>
              <Field label="State"><Input name="state" /></Field>
              <Field label="Pincode"><Input name="pincode" inputMode="numeric" maxLength={6} /><FieldError name="pincode" /></Field>
            </div>
            <SubmitButton size="lg" disabled={bookings > 0}>Submit for verification</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={registerRecyclerAction} className="space-y-4">
            <Field label="Company name"><Input name="name" /><FieldError name="name" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recycling licence no."><Input name="licenseNumber" /></Field>
              <Field label="Pollution control (CTO) no."><Input name="pollutionCertNo" /></Field>
            </div>
            <Field label="City"><Input name="city" /></Field>
            <fieldset><legend className="mb-2 text-sm font-medium">Materials accepted</legend><div className="grid grid-cols-2 gap-2">{["Cotton", "Denim", "Polyester blends", "Wool", "Mixed fibre", "Silk"].map((m) => <Checkbox key={m} name="materialsAccepted" value={m} label={m} />)}</div></fieldset>
            <SubmitButton size="lg" disabled={bookings > 0}>Submit for verification</SubmitButton>
          </ActionForm>
        )}
      </div>
    </section>
  );
}
