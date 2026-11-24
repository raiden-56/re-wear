import { Check, Droplets, Package, X } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { ACCEPTED, REJECTED } from "@/content/site";
import { images } from "@/lib/images";

export const metadata = { title: "Accepted clothing guidelines" };

export default function GuidelinesPage() {
  return (
    <>
      <PageHero eyebrow="Guidelines" title="What we accept — and what we can't." intro="Clean and dry is the rule. Even worn-out cotton earns at recycling rates. Items we can't accept are weighed separately and never paid — or charged for." image={images.foldedSweaters} imageAlt="A stack of folded knit sweaters" />
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
        <div className="rounded-3xl border border-line bg-white p-7">
          <h2 className="flex items-center gap-2 text-xl font-bold text-forest"><Check /> Accepted</h2>
          <ul className="mt-5 space-y-3">{ACCEPTED.map((a) => <li key={a} className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-sage" />{a}</li>)}</ul>
        </div>
        <div className="rounded-3xl border border-line bg-cream-200/60 p-7">
          <h2 className="flex items-center gap-2 text-xl font-bold text-danger"><X /> Not accepted</h2>
          <ul className="mt-5 space-y-3">{REJECTED.map((a) => <li key={a} className="flex gap-3"><X className="mt-1 size-4 shrink-0 text-danger/70" />{a}</li>)}</ul>
        </div>
        <div className="rounded-3xl border border-line bg-white p-7 md:col-span-2">
          <h2 className="text-xl font-bold">Preparing for pickup</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            {[
              [Droplets, "Dry is essential", "Damp clothes damage whole batches. If anything is wet, set it aside — we'll weigh it as rejected."],
              [Package, "Any bag works", "Use any bags or boxes. We weigh them empty (tare) so you're never paid less for packaging."],
              [Check, "Sort if you can", "Grouping by category speeds up weighing, but the collector can sort at your door too."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Check;
              return <div key={t as string}><I className="size-6 text-forest" /><h3 className="mt-3 font-semibold">{t as string}</h3><p className="mt-1 text-sm text-muted">{d as string}</p></div>;
            })}
          </div>
        </div>
      </section>
    </>
  );
}
