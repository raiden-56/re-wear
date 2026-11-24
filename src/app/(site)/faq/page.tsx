import { ChevronDown } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { FAQ } from "@/content/site";

export const metadata = { title: "FAQ" };

export default function FaqPage() {
  const groups = [...new Set(FAQ.map((f) => f.group))];
  return (
    <>
      <PageHero eyebrow="FAQ" title="Frequently asked questions" intro="Pickup, weighing, payment and what happens to your clothes." />
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        {groups.map((g) => (
          <div key={g} className="mb-10">
            <h2 className="mb-4 text-xl font-bold">{g}</h2>
            <div className="divide-y divide-line rounded-3xl border border-line bg-white">
              {FAQ.filter((f) => f.group === g).map((f) => (
                <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" /></summary>
                  <p className="mt-3 leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
