import Image from "next/image";

export function PageHero({ eyebrow, title, intro, image, imageAlt }: { eyebrow: string; title: string; intro: string; image?: string; imageAlt?: string }) {
  return (
    <section className="border-b border-line">
      <div className={`mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:py-20 ${image ? "lg:grid-cols-[1.2fr_1fr] lg:items-center" : ""}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{intro}</p>
        </div>
        {image && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem]">
            <Image src={image} alt={imageAlt ?? ""} fill priority sizes="(max-width: 1024px) 100vw, 40vw" className="object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mt-1.5 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-charcoal/80 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-charcoal/80">
      {children}
    </div>
  );
}
