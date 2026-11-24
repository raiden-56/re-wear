import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { ActionForm, SubmitButton, FieldError } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { submitContact } from "@/app/actions/public";
import { getSetting } from "@/server/settings";
import { PincodeChecker } from "@/components/site/pincode-checker";

export const metadata = { title: "Contact" };

const TOPICS = [
  ["general", "General question"],
  ["apartment", "Apartment collection drive"],
  ["corporate", "Corporate / bulk collection"],
  ["b2b", "Buying stock (B2B)"],
  ["recycler", "Recycling partnership"],
  ["ngo", "NGO / donation partnership"],
  ["press", "Press"],
];

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const brand = await getSetting("branding");
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to a human." intro="Questions about a pickup, planning a society drive, or buying stock in bulk — we reply within one working day." />
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <ul className="space-y-4 text-[15px]">
            <li className="flex gap-3"><Phone className="size-5 text-forest" /> {brand.supportPhone} <span className="text-muted">(9 AM – 7 PM)</span></li>
            <li className="flex gap-3"><MessageCircle className="size-5 text-forest" /> WhatsApp {brand.whatsapp}</li>
            <li className="flex gap-3"><Mail className="size-5 text-forest" /> {brand.supportEmail}</li>
            <li className="flex gap-3"><MapPin className="size-5 shrink-0 text-forest" /> {brand.address}</li>
          </ul>
          <div className="rounded-3xl border border-line bg-white p-6">
            <h2 className="font-semibold">Do we pick up near you?</h2>
            <PincodeChecker />
          </div>
        </div>
        <ActionForm action={submitContact} resetOnSuccess className="space-y-4 rounded-3xl border border-line bg-white p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name"><Input id="name" name="name" required autoComplete="name" /><FieldError name="name" /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" inputMode="tel" autoComplete="tel" /></Field>
          </div>
          <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" /><FieldError name="email" /></Field>
          <Field label="Topic" htmlFor="topic">
            <Select id="topic" name="topic" defaultValue={TOPICS.some(([v]) => v === topic) ? topic : "general"}>
              {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Message" htmlFor="message"><Textarea id="message" name="message" rows={5} required /><FieldError name="message" /></Field>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <SubmitButton size="lg" pendingText="Sending…">Send message</SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
