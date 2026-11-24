import Image from "next/image";
import { PageHero } from "@/components/site/page-hero";
import { images } from "@/lib/images";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About ReWear" title="Clothes are too valuable to throw away." intro="India discards millions of tonnes of textiles every year. Most of it is still wearable — or recyclable into new fibre. ReWear makes clearing your wardrobe simple and fairly paid, and makes sure every garment finds its best next use." />
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem]">
          <Image src={images.streetMarket} alt="People browsing racks of second-hand clothing at a street market" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
        </div>
        <div className="space-y-5 text-lg leading-relaxed text-charcoal/80">
          <h2 className="text-3xl font-bold text-charcoal">What we believe</h2>
          <p><strong>Fair and transparent.</strong> You see the rate, the scale photo, the tare and the net weight. You approve before anything is final.</p>
          <p><strong>Free, without fine print.</strong> Pickup is free, permanently. We never recover logistics costs from your earnings.</p>
          <p><strong>Paid like a professional.</strong> Directly to your UPI ID, with a bank reference — not points or a wallet you have to withdraw from.</p>
          <p><strong>Circular by design.</strong> Resale first, then reuse, upcycling and recycling with verified partners. Donations are kept separate from commercial sales.</p>
        </div>
      </section>
    </>
  );
}
