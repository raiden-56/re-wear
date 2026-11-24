import Image from "next/image";
import { PageHero } from "@/components/site/page-hero";
import { CountUp } from "@/components/motion";
import { gradeLabel } from "@/lib/labels";
import { images } from "@/lib/images";
import { inventoryDistribution } from "@/server/services/analytics";
import { publicStats } from "@/server/services/public";
import { IMPACT_FACTORS } from "@/content/site";

export const metadata = { title: "Sustainability" };

export default async function SustainabilityPage() {
  const [stats, dist] = await Promise.all([publicStats(), inventoryDistribution()]);
  const total = dist.reduce((s, d) => s + d.kg, 0) || 1;
  return (
    <>
      <PageHero eyebrow="Sustainability" title="The waste hierarchy, applied to every kilogram." intro="Reuse beats recycling, and recycling beats landfill. Our sorting grades decide each garment's next life — and our records track its weight from your door to its destination." image={images.fabricScraps} imageAlt="A tangle of colourful threads and fabric scraps" />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl bg-forest p-7 text-white"><div className="text-sm text-white/70">Clothes diverted</div><div className="num mt-2 font-display text-4xl font-bold"><CountUp value={Math.round(stats.kg)} suffix=" kg" /></div></div>
          <div className="rounded-3xl border border-line bg-white p-7"><div className="text-sm text-muted">Estimated CO₂e avoided</div><div className="num mt-2 font-display text-4xl font-bold"><CountUp value={Math.round(stats.kg * IMPACT_FACTORS.co2PerKg)} suffix=" kg" /></div></div>
          <div className="rounded-3xl border border-line bg-white p-7"><div className="text-sm text-muted">Estimated water saved</div><div className="num mt-2 font-display text-4xl font-bold"><CountUp value={Math.round(stats.kg * IMPACT_FACTORS.waterLitresPerKg)} suffix=" L" /></div></div>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Where stock is right now</h2>
            <p className="mt-2 text-muted">Live inventory across our sorting hubs, by grade.</p>
            <ul className="mt-6 space-y-3">
              {dist.filter((d) => d.grade !== "REJECTED").map((d) => (
                <li key={d.grade}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{gradeLabel[d.grade]?.label}</span><span className="num text-muted">{d.kg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg</span></div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-cream-200"><div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(2, (d.kg / total) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative min-h-72 overflow-hidden rounded-[2rem]">
            <Image src={images.threadSpools} alt="Spools of recycled thread" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
          </div>
        </div>
        <div className="mt-12 rounded-3xl border border-line bg-white p-7 text-sm leading-relaxed text-muted">
          <h3 className="font-semibold text-charcoal">Method</h3>
          <p className="mt-2">Impact estimates use conservative published averages for garment reuse: {IMPACT_FACTORS.co2PerKg} kg CO₂e and {IMPACT_FACTORS.waterLitresPerKg} litres of water avoided per kilogram of textile diverted from virgin production. They are estimates, not certified offsets. Weights are the accepted net weights recorded at pickup.</p>
        </div>
      </section>
    </>
  );
}
