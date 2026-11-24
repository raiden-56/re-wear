"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, HandHeart, Info, Loader2, MapPin, Minus, Plus, Recycle, Scale, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";
import { createBookingAction } from "@/app/actions/customer";
import { AddressForm, type SavedAddress } from "./address-form";
import { PhotoUploader, type Uploaded } from "@/components/forms/photo-uploader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Tween } from "@/components/motion";
import { cn } from "@/lib/utils";

type Channel = "KG_BUYBACK" | "PREMIUM_RESALE" | "RECYCLING" | "DONATION";
type Cat = { id: string; slug: string; name: string; imageUrl: string | null; rate: number | null };
type Address = { id: string; label: string; line1: string; line2: string | null; city: string; pincode: string; serviceable: boolean; isDefault: boolean };
type Partner = { id: string; name: string; city: string; description: string | null; has80G: boolean; focusAreas: string[] };
type Slot = { id: string; label: string; remaining: number; available: boolean };
type Quote = { lines: { categoryId: string; name: string; grams: number; ratePaisePerKg: number; subtotalPaise: number }[]; totalPaise: number; totalGrams: number };

const OPTIONS: { key: Channel; title: string; body: string; icon: React.ElementType }[] = [
  { key: "KG_BUYBACK", title: "Quick Sell by KG", body: "Everyday clothes, paid per kilogram at category rates.", icon: Scale },
  { key: "PREMIUM_RESALE", title: "Premium Clothing Resale", body: "Branded or barely-worn pieces. Higher rates after premium inspection.", icon: Sparkles },
  { key: "RECYCLING", title: "Recycling", body: "Worn-out, torn or faded textiles — still paid at recycling rates.", icon: Recycle },
  { key: "DONATION", title: "Donation", body: "Give wearable clothes to a verified NGO partner. You'll get a receipt.", icon: HandHeart },
];

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function SellWizard({ catalog, addresses: initialAddresses, partners, days }: { catalog: Record<Channel, Cat[]>; addresses: Address[]; partners: Partner[]; days: { value: string; label: string; sub: string }[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(1);
  const [dir, setDir] = React.useState(1);
  const [channel, setChannel] = React.useState<Channel>("KG_BUYBACK");
  const [cats, setCats] = React.useState<string[]>([]);
  const [kg, setKg] = React.useState(8);
  const [bags, setBags] = React.useState(2);
  const [photos, setPhotos] = React.useState<Uploaded[]>([]);
  const [instructions, setInstructions] = React.useState("");
  const [partnerId, setPartnerId] = React.useState<string>(partners[0]?.id ?? "");
  const [addresses, setAddresses] = React.useState(initialAddresses);
  const [addressId, setAddressId] = React.useState(initialAddresses.find((a) => a.isDefault && a.serviceable)?.id ?? initialAddresses.find((a) => a.serviceable)?.id ?? "");
  const [date, setDate] = React.useState(days[0]?.value ?? "");
  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [area, setArea] = React.useState<{ city: string; name: string; minimumKgPolicy: number; policyNote: string | null } | null>(null);
  const [slotId, setSlotId] = React.useState("");
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [submitting, startSubmit] = React.useTransition();

  const available = catalog[channel].filter((c) => channel === "DONATION" || c.rate !== null);
  const items = React.useMemo(() => {
    const total = Math.round(kg * 1000);
    const base = Math.floor(total / Math.max(1, cats.length));
    let rem = total - base * cats.length;
    return cats.map((categoryId) => {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      return { categoryId, grams: base + extra };
    });
  }, [cats, kg]);

  // Server-side estimate whenever inputs that affect it change (step ≥ 4).
  React.useEffect(() => {
    if (step < 4 || cats.length === 0) return;
    const ctrl = new AbortController();
    setQuoting(true);
    fetch("/api/pricing/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, items, addressId: addressId || undefined }), signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setQuote(body);
      })
      .catch((e) => e.name !== "AbortError" && toast.error(e.message))
      .finally(() => setQuoting(false));
    return () => ctrl.abort();
  }, [step, channel, items, addressId, cats.length]);

  // Live slot availability for chosen address + date.
  React.useEffect(() => {
    if (step !== 5 || !addressId || !date) return;
    setSlots(null);
    setSlotId("");
    fetch(`/api/pickup/slots?addressId=${addressId}&date=${date}`)
      .then((r) => r.json())
      .then((b) => {
        setSlots(b.slots ?? []);
        setArea(b.area ?? null);
      })
      .catch(() => setSlots([]));
  }, [step, addressId, date]);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const canNext = step === 1 ? !!channel : step === 2 ? cats.length > 0 && (channel !== "DONATION" || !!partnerId) : step === 3 ? kg > 0 && bags > 0 : step === 4 ? !!quote && !quoting : !!(addressId && date && slotId);

  const confirm = () => {
    const payload = { channel, items, bagCount: bags, instructions: instructions || null, photoKeys: photos.map((p) => p.key), addressId, pickupDate: date, slotId, donationPartnerId: channel === "DONATION" ? partnerId : null };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startSubmit(async () => {
      const r = await createBookingAction({ ok: false }, fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.push(`/app/bookings/${r.data?.id}?new=1`);
    });
  };

  const selectedAddress = addresses.find((a) => a.id === addressId);
  const titles = ["Choose how to sell", "What are you clearing out?", "How much, roughly?", "Your estimate", "Schedule your free pickup"];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Stepper */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-medium text-muted">
          <span>Step {step} of 5</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-2.5 py-1 font-semibold text-forest"><Truck className="size-3.5" /> FREE PICKUP</span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className={cn("h-1.5 rounded-full transition-colors duration-500", i <= step ? "bg-forest" : "bg-cream-200")} />)}
        </div>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">{titles[step - 1]}</h1>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div key={step} custom={dir} initial={reduce ? false : { opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: dir * -24 }} transition={{ duration: 0.25 }}>
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Selling option">
              {OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={channel === o.key}
                  onClick={() => {
                    setChannel(o.key);
                    setCats((c) => c.filter((id) => catalog[o.key].some((x) => x.id === id && (o.key === "DONATION" || x.rate !== null))));
                  }}
                  className={cn("rounded-2xl border-2 bg-white p-5 text-left transition-all", channel === o.key ? "border-forest shadow-[0_8px_24px_-12px_rgba(23,75,55,0.4)]" : "border-line hover:border-charcoal/25")}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("grid size-10 place-items-center rounded-xl", channel === o.key ? "bg-forest text-white" : "bg-forest-50 text-forest")}><o.icon className="size-5" /></span>
                    {channel === o.key && <Check className="size-5 text-forest" />}
                  </div>
                  <div className="mt-4 font-semibold">{o.title}</div>
                  <p className="mt-1 text-sm text-muted">{o.body}</p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {available.map((c) => {
                  const on = cats.includes(c.id);
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => setCats((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))} className={cn("group overflow-hidden rounded-2xl border-2 bg-white text-left transition-all", on ? "border-forest" : "border-line hover:border-charcoal/25")}>
                      <div className="relative aspect-[5/3] bg-cream">
                        {c.imageUrl && <Image src={c.imageUrl} alt="" fill sizes="200px" className="object-cover" />}
                        {on && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-forest text-white"><Check className="size-3.5" /></span>}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-semibold">{c.name}</div>
                        <div className="num text-xs text-muted">{channel === "DONATION" ? "Donation" : `${inr(c.rate!)}/kg`}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {channel === "DONATION" && (
                <div>
                  <h2 className="mb-3 font-semibold">Choose an NGO partner</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {partners.map((p) => (
                      <button key={p.id} type="button" onClick={() => setPartnerId(p.id)} aria-pressed={partnerId === p.id} className={cn("rounded-2xl border-2 bg-white p-4 text-left", partnerId === p.id ? "border-forest" : "border-line")}>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-muted">{p.city} · {p.focusAreas.join(", ")}{p.has80G && " · 80G"}</div>
                        {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 rounded-3xl border border-line bg-white p-6">
              <div>
                <div className="flex items-end justify-between"><span className="font-medium">Approximate weight</span><span className="num font-display text-3xl font-bold">{kg} kg</span></div>
                <div className="mt-3 flex items-center gap-3">
                  <Button type="button" variant="secondary" size="iconSm" aria-label="Less" onClick={() => setKg((k) => Math.max(1, k - 1))}><Minus /></Button>
                  <input type="range" min={1} max={100} value={kg} onChange={(e) => setKg(Number(e.target.value))} className="flex-1 accent-[var(--forest)]" aria-label="Approximate weight in kg" />
                  <Button type="button" variant="secondary" size="iconSm" aria-label="More" onClick={() => setKg((k) => Math.min(100, k + 1))}><Plus /></Button>
                </div>
                <p className="mt-2 text-xs text-muted">Not sure? A full shopping bag of clothes is about 5 kg. You're paid on the actual weighed amount.</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Number of bags</span>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="secondary" size="iconSm" aria-label="Fewer bags" onClick={() => setBags((b) => Math.max(1, b - 1))}><Minus /></Button>
                  <span className="num w-8 text-center text-xl font-bold">{bags}</span>
                  <Button type="button" variant="secondary" size="iconSm" aria-label="More bags" onClick={() => setBags((b) => Math.min(50, b + 1))}><Plus /></Button>
                </div>
              </div>
              <div>
                <div className="mb-2 font-medium">Photos (optional)</div>
                <PhotoUploader purpose="BOOKING_PHOTO" value={photos} onChange={setPhotos} max={6} />
              </div>
              <Field label="Collection instructions (optional)">
                <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} placeholder="e.g. Call from the gate, bags are with the security guard." />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-3xl border border-line bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-cream/70 text-left text-xs uppercase tracking-wide text-muted">
                    <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Rate / kg</th><th className="px-4 py-3 text-right">Est. weight</th><th className="px-4 py-3 text-right">Est. earnings</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(quote?.lines ?? items.map((i) => ({ ...i, name: available.find((c) => c.id === i.categoryId)?.name ?? "", ratePaisePerKg: 0, subtotalPaise: 0 }))).map((l) => (
                      <tr key={l.categoryId}>
                        <td className="px-4 py-3 font-medium">{l.name}</td>
                        <td className="num px-4 py-3 text-right">{quote ? inr(l.ratePaisePerKg) : "…"}</td>
                        <td className="num px-4 py-3 text-right">{(l.grams / 1000).toFixed(1)} kg</td>
                        <td className="num px-4 py-3 text-right font-semibold">{quote ? inr(l.subtotalPaise) : "…"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-line">
                    <tr><td className="px-4 py-3 font-medium text-forest" colSpan={3}><span className="inline-flex items-center gap-1.5"><Truck className="size-4" /> Pickup</span></td><td className="num px-4 py-3 text-right font-bold text-forest">FREE</td></tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-end justify-between rounded-3xl bg-forest p-6 text-white">
                <div>
                  <div className="text-sm text-white/70">{channel === "DONATION" ? "Donation weight" : "Estimated total"}</div>
                  {channel === "DONATION" ? <div className="num font-display text-4xl font-extrabold">{kg} kg</div> : <Tween value={quote?.totalPaise ?? 0} format={inr} className="num font-display text-4xl font-extrabold" />}
                </div>
                {quoting && <Loader2 className="size-5 animate-spin text-amber" />}
              </div>
              <p className="flex gap-2 rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
                <Info className="mt-0.5 size-4 shrink-0 text-forest" />
                {channel === "DONATION" ? "Donations are weighed at pickup for your receipt. No payment is made for donated clothes." : "Final earnings depend on verified weight, inspection and the applicable category rates. Rates shown are locked when you confirm your booking."}
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Pickup address</h2>
                  <Dialog open={addOpen} onOpenChange={setAddOpen} title="Add a new address" trigger={<Button type="button" variant="secondary" size="sm"><Plus /> Add new</Button>}>
                    <AddressForm
                      onSaved={(a: SavedAddress) => {
                        setAddresses((list) => [...list, { id: a.id, label: a.label, line1: a.line1, line2: null, city: a.city, pincode: a.pincode, serviceable: a.serviceable, isDefault: false }]);
                        if (a.serviceable) setAddressId(a.id);
                        setAddOpen(false);
                      }}
                    />
                  </Dialog>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.length === 0 && <p className="text-sm text-muted">Add an address to continue.</p>}
                  {addresses.map((a) => (
                    <button key={a.id} type="button" disabled={!a.serviceable} onClick={() => setAddressId(a.id)} aria-pressed={addressId === a.id} className={cn("rounded-2xl border-2 bg-white p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60", addressId === a.id ? "border-forest" : "border-line")}>
                      <div className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-forest" /> {a.label}</div>
                      <div className="mt-1 text-sm text-muted">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.pincode}</div>
                      {!a.serviceable && <div className="mt-2 text-xs font-medium text-danger">Not serviceable yet</div>}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="mb-3 font-semibold">Date</h2>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {days.map((d) => (
                    <button key={d.value} type="button" onClick={() => setDate(d.value)} aria-pressed={date === d.value} className={cn("min-w-[4.5rem] shrink-0 rounded-2xl border-2 px-3 py-2.5 text-center transition-all", date === d.value ? "border-forest bg-forest text-white" : "border-line bg-white")}>
                      <div className="text-[11px] uppercase opacity-70">{d.sub}</div>
                      <div className="font-semibold">{d.label}</div>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="mb-3 font-semibold">Time slot</h2>
                {area && area.minimumKgPolicy > 0 && <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-[#6b4813]">Published policy for {area.name}: minimum {(area.minimumKgPolicy / 1000).toFixed(1)} kg per pickup. {area.policyNote} Pickup is still free.</p>}
                {!addressId ? <p className="text-sm text-muted">Choose an address first.</p> : slots === null ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>
                ) : slots.length === 0 ? (
                  <p className="rounded-xl bg-white p-4 text-sm text-muted ring-1 ring-line">No pickups on this date in your area. Try another day.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button key={s.id} type="button" disabled={!s.available} onClick={() => setSlotId(s.id)} aria-pressed={slotId === s.id} className={cn("rounded-2xl border-2 p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50", slotId === s.id ? "border-forest bg-forest-50" : "border-line bg-white")}>
                        <div className="font-semibold">{s.label}</div>
                        <div className="text-xs text-muted">{s.available ? `${s.remaining} left` : s.remaining === 0 ? "Full" : "Closed"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <div className="rounded-3xl border border-line bg-white p-5">
                <h3 className="font-semibold">Summary</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">Option</dt><dd className="font-medium">{OPTIONS.find((o) => o.key === channel)?.title}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Estimated weight</dt><dd className="num font-medium">{kg} kg · {bags} bag{bags > 1 ? "s" : ""}</dd></div>
                  {channel !== "DONATION" && <div className="flex justify-between"><dt className="text-muted">Estimated earnings</dt><dd className="num font-medium">{quote ? inr(quote.totalPaise) : "…"}</dd></div>}
                  <div className="flex justify-between"><dt className="text-muted">Address</dt><dd className="text-right font-medium">{selectedAddress ? `${selectedAddress.label}, ${selectedAddress.pincode}` : "—"}</dd></div>
                  <div className="flex justify-between border-t border-line pt-2"><dt className="font-semibold text-forest">Pickup charge</dt><dd className="num font-bold text-forest">₹0 · FREE</dd></div>
                </dl>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-20 z-10 mt-8 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-3 backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => go(step - 1)} disabled={step === 1}><ArrowLeft /> Back</Button>
        {step < 5 ? (
          <Button type="button" onClick={() => go(step + 1)} disabled={!canNext}>Continue <ArrowRight /></Button>
        ) : (
          <Button type="button" onClick={confirm} disabled={!canNext || submitting}>{submitting ? <Loader2 className="animate-spin" /> : <Check />} Confirm free pickup</Button>
        )}
      </div>
    </div>
  );
}
