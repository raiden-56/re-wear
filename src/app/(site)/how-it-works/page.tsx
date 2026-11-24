import Link from "next/link";
import { ArrowRight, CalendarCheck, Camera, ClipboardCheck, IndianRupee, KeyRound, PackageCheck, Scale, Warehouse } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { Button } from "@/components/ui/button";
import { images } from "@/lib/images";

export const metadata = { title: "How it works" };

const FLOW = [
  [CalendarCheck, "Book in two minutes", "Choose Quick Sell by KG, Premium Resale, Recycling or Donation. Pick categories, estimate weight, see live rates and an instant estimate. Choose a free 2-hour pickup slot."],
  [KeyRound, "Collector verifies at your door", "You get a 4-digit booking code in the app. The collector must enter it before starting — so you always know it's a genuine ReWear pickup."],
  [Scale, "Transparent digital weighing", "Bags are weighed on a calibrated scale (gross), empty bags are weighed (tare), and the difference is your net weight. Each category is weighed separately."],
  [Camera, "Evidence for every number", "The collector photographs the scale display. Photos, weights and rates are attached to your booking for you to review."],
  [ClipboardCheck, "You approve the valuation", "Approve in the app, or read out the one-time code we text you. Disagree? Reject it — nothing is finalised without you."],
  [IndianRupee, "Direct UPI payment", "Payment goes straight to your UPI ID. Track it from approved to successful, with the bank's UTR and a downloadable receipt."],
  [Warehouse, "Sorted at our hub", "Every batch is received, re-weighed and graded: premium, standard reusable, repairable, recyclable or upcycling."],
  [PackageCheck, "A second life", "Premium pieces are resold individually; wearables go to thrift partners and NGOs; the rest goes to verified textile recyclers."],
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <PageHero eyebrow="How it works" title="From your wardrobe to a second life — transparently." intro="Every step is recorded: who collected, what was weighed, which rate applied, when you approved and when the money reached your bank." image={images.pileDenimShirts} imageAlt="A pile of denim jeans and shirts ready for sorting" />
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <ol className="relative space-y-10 border-l-2 border-dashed border-line pl-8">
          {FLOW.map(([Icon, title, body], i) => (
            <li key={title} className="relative">
              <span className="absolute -left-[3.15rem] grid size-10 place-items-center rounded-full border-4 border-cream bg-forest text-white"><Icon className="size-4" /></span>
              <div className="text-xs font-semibold uppercase tracking-wider text-sage">Step {i + 1}</div>
              <h2 className="mt-1 text-2xl font-bold">{title}</h2>
              <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-16 rounded-3xl bg-forest p-8 text-white sm:flex sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-bold">Ready when you are.</h3>
            <p className="mt-1 text-white/75">Pickup is free. Approving is up to you.</p>
          </div>
          <Button asChild variant="amber" size="lg" className="mt-5 sm:mt-0"><Link href="/app/sell">Start selling <ArrowRight /></Link></Button>
        </div>
      </section>
    </>
  );
}
