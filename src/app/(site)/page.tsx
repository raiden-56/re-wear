import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Camera, Check, ChevronDown, CircleDollarSign, Factory, HandHeart, Home, Recycle, Scale, ShieldCheck, Shirt, Sparkles, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountUp, Reveal } from "@/components/motion";
import { EarningsCalculator } from "@/components/site/earnings-calculator";
import { ACCEPTED, FAQ, REJECTED, STEPS } from "@/content/site";
import { categoryImages, images } from "@/lib/images";
import { formatINR } from "@/lib/utils";
import { rateCard } from "@/server/services/pricing";
import { activeCities, publicStats } from "@/server/services/public";
import { getSetting } from "@/server/settings";

export default async function HomePage() {
  const [rates, stats, cities, testimonials] = await Promise.all([rateCard("KG_BUYBACK"), publicStats(), activeCities(), getSetting("testimonials")]);
  const priced = rates.filter((r) => r.ratePaisePerKg !== null);

  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16 lg:pb-24">
          <div className="flex flex-col justify-center">
            <div className="rise">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-forest">
                <Truck className="size-3.5" /> Free doorstep pickup in {cities.map((c) => c.city).join(", ")}
              </span>
            </div>
            <div className="rise" style={{ animationDelay: "60ms" }}>
              <h1 className="mt-6 text-[2.6rem] leading-[1.02] font-extrabold sm:text-6xl lg:text-[4.25rem]">
                Your old clothes <span className="relative whitespace-nowrap text-forest">still have value<svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" aria-hidden><path d="M2 9c60-6 180-8 296-3" fill="none" stroke="var(--amber)" strokeWidth="4" strokeLinecap="round" /></svg></span>.
              </h1>
            </div>
            <div className="rise" style={{ animationDelay: "120ms" }}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-charcoal/75">
                Sell your clothes by the kilogram. We pick them up for free, weigh them in front of you, and pay you directly to UPI — then give every garment a second life through resale, reuse and recycling.
              </p>
            </div>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
              <Button asChild size="lg">
                <Link href="/app/sell">Start selling <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/pricing">See today's rates</Link>
              </Button>
            </div>
            <div className="rise" style={{ animationDelay: "240ms" }}>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
                <div>
                  <dt className="text-xs text-muted">Clothes collected</dt>
                  <dd className="num font-display text-2xl font-bold"><CountUp value={Math.round(stats.kg)} suffix=" kg" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Paid to customers</dt>
                  <dd className="num font-display text-2xl font-bold"><CountUp value={Math.round(stats.paidPaise / 100)} prefix="₹" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Pickup fee</dt>
                  <dd className="num font-display text-2xl font-bold text-forest">₹0</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="relative">
            <div className="grid h-full min-h-[440px] grid-cols-5 grid-rows-6 gap-3">
              <div className="relative col-span-3 row-span-6 overflow-hidden rounded-[2rem]">
                <Image src={images.heroRack} alt="A wooden rail of colourful pre-loved garments on hangers" fill priority sizes="(max-width: 1024px) 60vw, 30vw" className="object-cover" />
              </div>
              <div className="relative col-span-2 row-span-3 overflow-hidden rounded-[2rem]">
                <Image src={images.foldedJeansHands} alt="Hands holding a stack of folded denim jeans" fill sizes="20vw" className="object-cover" />
              </div>
              <div className="relative col-span-2 row-span-3 overflow-hidden rounded-[2rem] bg-forest p-5 text-white">
                <Scale className="size-6 text-amber" />
                <div className="mt-3 text-xs uppercase tracking-wider text-white/60">Example weighing</div>
                <div className="num font-display text-2xl font-bold">11.48 kg</div>
                <div className="mt-1 text-sm text-white/70">net, after 0.65 kg bag tare</div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs"><BadgeCheck className="size-3.5 text-amber" /> Paid to UPI</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Calculator & live pricing ───────── */}
      <section id="rates" className="border-y border-line bg-white/60">
        <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <Reveal><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Live KG pricing</p></Reveal>
            <Reveal delay={0.05}><h2 className="mt-3 text-4xl font-bold sm:text-5xl">Transparent rates for every category.</h2></Reveal>
            <Reveal delay={0.1}><p className="mt-4 max-w-lg text-lg text-muted">Rates come straight from our pricing engine. When you confirm a booking, its rates are locked — later changes never touch your booking.</p></Reveal>
            <Reveal delay={0.15}>
              <ul className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
                {priced.slice(0, 7).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="relative size-10 overflow-hidden rounded-xl bg-cream">
                        {r.imageUrl && <Image src={r.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
                      </span>
                      <span className="font-medium">{r.name}</span>
                    </span>
                    <span className="num font-display text-lg font-bold">{formatINR(r.ratePaisePerKg)}<span className="text-sm font-medium text-muted">/kg</span></span>
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline">All {priced.length} categories and city rates <ArrowRight className="size-4" /></Link>
            </Reveal>
          </div>
          <Reveal delay={0.1}><EarningsCalculator rates={priced.map((r) => ({ id: r.id, slug: r.slug, name: r.name, ratePaisePerKg: r.ratePaisePerKg }))} /></Reveal>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">How it works</p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold sm:text-5xl">Four steps. About twenty minutes at your door.</h2>
          </div>
          <Button asChild variant="secondary"><Link href="/how-it-works">The full process</Link></Button>
        </div>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 0.06} className="bg-cream p-7">
              <span className="num font-display text-5xl font-extrabold text-forest/15">0{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ───────── Categories ───────── */}
      <section className="bg-forest-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:items-end">
            <h2 className="text-4xl font-bold sm:text-5xl">From sarees to school uniforms.</h2>
            <p className="max-w-xl text-lg text-white/70 lg:justify-self-end">Thirteen clothing categories, each with its own rate. Mix as many as you like in one pickup — the collector weighs them separately.</p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {priced.slice(0, 12).map((c, i) => (
              <Reveal key={c.id} delay={(i % 6) * 0.04} className="group relative aspect-[3/4] overflow-hidden rounded-2xl">
                <Image src={categoryImages[c.slug] ?? images.apparel} alt={c.name} fill sizes="(max-width: 640px) 50vw, 16vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  <div className="font-semibold">{c.name}</div>
                  <div className="num text-sm text-amber">{formatINR(c.ratePaisePerKg)}/kg</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Accepted / rejected ───────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Accepted clothing</p>
            <h2 className="mt-3 text-4xl font-bold">Clean, dry and wearable — or recyclable.</h2>
            <p className="mt-4 text-lg text-muted">Worn-out cotton still earns at recycling rates. We just can't take anything wet, soiled or hazardous.</p>
            <Button asChild variant="link" className="mt-4"><Link href="/guidelines">Read the full guidelines →</Link></Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-line bg-white p-6">
              <h3 className="flex items-center gap-2 font-semibold text-forest"><Check className="size-5" /> We accept</h3>
              <ul className="mt-4 space-y-3 text-[15px]">{ACCEPTED.map((a) => <li key={a} className="flex gap-2.5"><Check className="mt-1 size-4 shrink-0 text-sage" />{a}</li>)}</ul>
            </div>
            <div className="rounded-3xl border border-line bg-cream-200/60 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-danger"><X className="size-5" /> We can't accept</h3>
              <ul className="mt-4 space-y-3 text-[15px]">{REJECTED.map((a) => <li key={a} className="flex gap-2.5"><X className="mt-1 size-4 shrink-0 text-danger/70" />{a}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Free pickup + weighing ───────── */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#7a5317]"><Truck className="size-3.5" /> Free pickup · always</div>
            <h2 className="mt-5 text-4xl font-bold">We come to you. It never costs you a rupee.</h2>
            <p className="mt-4 text-lg text-muted">No pickup fee, no convenience fee, no deductions for transport. Choose any open 2-hour slot in the next two weeks. Availability depends only on whether we serve your pincode and how many slots are open.</p>
            <ul className="mt-8 space-y-4">
              {[
                [Home, "Doorstep, apartment lobby or office reception"],
                [ShieldCheck, "Verified, uniformed collectors with ID — they confirm a 4-digit booking code"],
                [Camera, "Photo of every scale reading saved to your booking"],
              ].map(([Icon, t], i) => {
                const I = Icon as typeof Home;
                return <li key={i} className="flex items-start gap-3 text-[15px]"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-forest-50"><I className="size-4 text-forest" /></span><span className="pt-1.5">{t as string}</span></li>;
              })}
            </ul>
          </div>
          <div className="rounded-[2rem] bg-cream p-6 sm:p-8">
            <h3 className="font-display text-xl font-bold">How weighing works</h3>
            <p className="mt-1 text-sm text-muted">Every number is shown to you before you approve.</p>
            <div className="mt-6 space-y-3">
              {[
                ["Gross weight", "Clothes + bags on the scale", "12.13 kg"],
                ["Tare weight", "Empty bags & containers", "− 0.65 kg"],
                ["Net weight", "What you're paid on", "11.48 kg"],
              ].map(([k, d, v], i) => (
                <div key={k} className={`flex items-center justify-between rounded-2xl p-4 ${i === 2 ? "bg-forest text-white" : "bg-white"}`}>
                  <div><div className="font-semibold">{k}</div><div className={`text-xs ${i === 2 ? "text-white/70" : "text-muted"}`}>{d}</div></div>
                  <div className="num font-display text-xl font-bold">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
              {[["Jeans", "4.82 kg", "₹106"], ["T-shirts", "3.96 kg", "₹48"], ["Kidswear", "2.70 kg", "₹32"]].map(([c, w, a]) => (
                <div key={c} className="rounded-xl border border-line bg-white p-3"><div className="text-muted">{c}</div><div className="num mt-1 font-semibold">{w}</div><div className="num text-forest">{a}</div></div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">Unaccepted items are weighed separately and never paid — or charged for.</p>
          </div>
        </div>
      </section>

      {/* ───────── Direct UPI ───────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem]">
            <Image src={images.foldedShirts} alt="Neatly folded shirts in assorted colours" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-white/95 p-4 backdrop-blur sm:right-auto sm:w-80">
              <div className="flex items-center justify-between text-sm"><span className="font-semibold">Example payout</span><span className="rounded-full bg-forest-50 px-2 py-0.5 text-xs font-semibold text-forest">Successful</span></div>
              <div className="num mt-2 font-display text-3xl font-bold">₹186.00</div>
              <div className="mt-1 text-xs text-muted">to ananya••••4@okaxis · UTR 4418829301</div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Direct UPI payment</p>
            <h2 className="mt-3 text-4xl font-bold">Straight to your bank. No wallet. No withdrawal.</h2>
            <p className="mt-4 text-lg text-muted">Add your UPI ID once. After you approve the valuation, the money is sent directly to your bank account — with the transaction reference and a downloadable receipt.</p>
            <ol className="mt-8 flex flex-wrap items-center gap-2 text-sm">
              {["Approved", "Payout initiated", "Processing", "Successful"].map((s, i) => (
                <li key={s} className="flex items-center gap-2"><span className="rounded-full border border-line bg-white px-3 py-1.5 font-medium">{s}</span>{i < 3 && <ArrowRight className="size-4 text-muted" />}</li>
              ))}
            </ol>
            <p className="mt-6 flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest" /> We only mark a payment successful after the bank confirms it. We never ask for your UPI PIN.</p>
          </div>
        </div>
      </section>

      {/* ───────── Marketplace ───────── */}
      {stats.products.length > 0 && (
        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Premium resale</p>
                <h2 className="mt-3 max-w-xl text-4xl font-bold">The best pieces get a new wardrobe.</h2>
                <p className="mt-3 max-w-xl text-lg text-muted">Quality-inspected, laundered and photographed individually — every listing has passed our premium grading.</p>
              </div>
              <Button asChild variant="secondary"><Link href="/shop">Shop pre-loved <ArrowRight /></Link></Button>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.products.map((p) => (
                <Link key={p.id} href={`/shop/${p.slug}`} className="group">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-cream">
                    <Image src={p.photoUrls[0]} alt={p.name} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-muted">{p.brand}</div>
                  <div className="font-medium">{p.name}</div>
                  <div className="num mt-0.5 flex items-baseline gap-2"><span className="font-semibold">{formatINR(p.pricePaise)}</span>{p.mrpPaise && <span className="text-sm text-muted line-through">{formatINR(p.mrpPaise)}</span>}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Sustainability ───────── */}
      <section className="relative isolate overflow-hidden">
        <Image src={images.sortingWarehouse} alt="Workers sorting piles of textiles in a large warehouse" fill sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-forest-700/85" />
        <div className="mx-auto max-w-7xl px-4 py-24 text-white sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber">Recycling & sustainability</p>
            <h2 className="mt-3 text-4xl font-bold sm:text-5xl">Every kilogram, sorted for its best next life.</h2>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Sparkles, "Premium resale", "Individually listed after inspection"],
              [Shirt, "Reuse", "Bulk wearables to thrift stores & NGOs"],
              [Recycle, "Recycling", "Verified recyclers turn fibre into new yarn"],
              [Factory, "Upcycling", "Fabric for bags, quilts and patchwork"],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Recycle;
              return (
                <div key={t as string} className="bg-forest-700/60 p-6 backdrop-blur-sm">
                  <I className="size-6 text-amber" />
                  <h3 className="mt-4 font-semibold">{t as string}</h3>
                  <p className="mt-1 text-sm text-white/70">{d as string}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4">
            <div><div className="num font-display text-4xl font-bold"><CountUp value={Math.round(stats.kg * 3.6)} suffix=" kg" /></div><div className="text-sm text-white/70">CO₂e avoided (est.)</div></div>
            <div><div className="num font-display text-4xl font-bold"><CountUp value={stats.completed} /></div><div className="text-sm text-white/70">pickups completed</div></div>
            <Button asChild variant="amber"><Link href="/sustainability">Our impact method</Link></Button>
          </div>
        </div>
      </section>

      {/* ───────── Apartment & corporate ───────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Collections at scale</p>
            <h2 className="mt-3 text-4xl font-bold">Apartment drives & corporate collections.</h2>
            <p className="mt-4 text-muted">One date, one collection point, individual weighing and UPI payment for every participant — or pooled as a donation.</p>
          </div>
          {[
            [Building2, "Apartment collection drives", "We set up a scale in your clubhouse for a morning. Residents drop off, get weighed and paid individually.", "/contact?topic=apartment"],
            [HandHeart, "Corporate & bulk collection", "Uniform refreshes, festival drives, office clear-outs. Weighed manifests and recycling certificates for your ESG reporting.", "/contact?topic=corporate"],
          ].map(([Icon, t, d, href]) => {
            const I = Icon as typeof Building2;
            return (
              <div key={t as string} className="flex flex-col rounded-3xl border border-line bg-white p-7">
                <I className="size-7 text-forest" />
                <h3 className="mt-5 text-xl font-bold">{t as string}</h3>
                <p className="mt-2 flex-1 text-muted">{d as string}</p>
                <Button asChild variant="secondary" className="mt-6 w-fit"><Link href={href as string}>Plan a collection</Link></Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───────── Testimonials (verified only) ───────── */}
      <section className="border-y border-line bg-cream-200/50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Customer stories</p>
          {testimonials.items.length > 0 ? (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {testimonials.items.map((t) => (
                <figure key={t.bookingCode} className="rounded-3xl bg-white p-7">
                  <blockquote className="text-lg leading-relaxed">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 text-sm"><span className="font-semibold">{t.name}</span> · {t.city}<span className="mt-1 flex items-center gap-1 text-xs text-forest"><BadgeCheck className="size-3.5" /> Verified customer · booking {t.bookingCode}</span></figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="mt-4 max-w-2xl">
              <h2 className="text-3xl font-bold">Real stories, coming soon.</h2>
              <p className="mt-3 text-muted">We only publish testimonials from verified customers who completed a pickup and gave written consent. No paid or invented reviews — ever.</p>
            </div>
          )}
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
        <h2 className="text-center text-4xl font-bold">Questions, answered.</h2>
        <div className="mt-10 divide-y divide-line rounded-3xl border border-line bg-white">
          {FAQ.slice(0, 7).map((f) => (
            <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" /></summary>
              <p className="mt-3 leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-6 text-center"><Link href="/faq" className="text-sm font-semibold text-forest hover:underline">All FAQs →</Link></div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-forest px-6 py-16 text-center text-white sm:px-16">
          <CircleDollarSign className="mx-auto size-10 text-amber" />
          <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-bold sm:text-5xl">Clear your wardrobe. Earn from every KG.</h2>
          <p className="mx-auto mt-4 max-w-lg text-white/75">Book a free pickup in under two minutes.</p>
          <Button asChild size="lg" variant="amber" className="mt-8"><Link href="/app/sell">Start selling <ArrowRight /></Link></Button>
        </div>
      </section>
    </>
  );
}
