import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { InstallButton } from "@/components/pwa/install-button";
import { getSetting } from "@/server/settings";

const COLS = [
  { title: "Sell", links: [["Start selling", "/app/sell"], ["How it works", "/how-it-works"], ["Today's rates", "/pricing"], ["What we accept", "/guidelines"]] },
  { title: "Shop & partner", links: [["Shop pre-loved", "/shop"], ["B2B partnerships", "/b2b"], ["Recyclers & NGOs", "/partners/register"], ["Apartment drives", "/contact?topic=apartment"]] },
  { title: "Company", links: [["About ReWear", "/about"], ["Sustainability", "/sustainability"], ["FAQ", "/faq"], ["Contact", "/contact"]] },
  { title: "Policies", links: [["Terms of service", "/terms"], ["Privacy policy", "/privacy"], ["Free pickup policy", "/terms#free-pickup"], ["Install the app", "/install"]] },
];

export async function SiteFooter() {
  const brand = await getSetting("branding");
  return (
    <footer className="bg-forest-700 text-white">
      <div className="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">{brand.tagline} Free doorstep pickup, honest weighing and direct UPI payment — then a second life for every garment.</p>
            <ul className="mt-6 space-y-2.5 text-sm text-white/80">
              <li className="flex items-center gap-2.5"><Phone className="size-4 text-amber" /> {brand.supportPhone}</li>
              <li className="flex items-center gap-2.5"><Mail className="size-4 text-amber" /> {brand.supportEmail}</li>
              <li className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-amber" /> {brand.address}</li>
            </ul>
            <InstallButton variant="outlineLight" className="mt-6" />
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLS.map((c) => (
              <div key={c.title}>
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber">{c.title}</h4>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href} className="text-sm text-white/75 transition-colors hover:text-white">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row">
          <p>© {new Date().getFullYear()} ReWear. Pickup is always free — no hidden collection charges, ever.</p>
          <p>Payments are sent directly to your UPI ID. ReWear never asks for your UPI PIN.</p>
        </div>
      </div>
    </footer>
  );
}
