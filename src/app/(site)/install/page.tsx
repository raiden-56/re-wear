import { Monitor, Share, Smartphone, SquarePlus } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { InstallButton } from "@/components/pwa/install-button";

export const metadata = { title: "Install the app" };

const SECTIONS = [
  { icon: Smartphone, title: "Android (Chrome, Edge, Samsung Internet)", steps: ["Open rewear on your phone in Chrome.", "Tap “Install app” on this page — or open the ⋮ menu and choose “Install app” / “Add to Home screen”.", "Confirm. ReWear opens full-screen from your home screen, like any app."] },
  { icon: Share, title: "iPhone & iPad (Safari, iOS 16.4+)", steps: ["Open rewear in Safari.", "Tap the Share button (square with an arrow).", "Scroll and tap “Add to Home Screen”, then “Add”.", "Launch ReWear from the new icon. Notifications require iOS 16.4 or later."] },
  { icon: Monitor, title: "Desktop (Chrome, Edge)", steps: ["Click the install icon in the address bar, or use “Install app” below.", "ReWear opens in its own window and appears in your Start menu / Dock."] },
];

export default function InstallPage() {
  return (
    <>
      <PageHero eyebrow="Install" title="Put ReWear on your home screen." intro="ReWear is a Progressive Web App: no app store, tiny download, always up to date. Collectors use the same install for their field app." />
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <InstallButton variant="amber" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {SECTIONS.map((s) => (
            <div key={s.title} className="rounded-3xl border border-line bg-white p-6">
              <s.icon className="size-6 text-forest" />
              <h2 className="mt-4 font-semibold">{s.title}</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">{s.steps.map((st) => <li key={st}>{st}</li>)}</ol>
            </div>
          ))}
        </div>
        <p className="mt-8 flex items-start gap-2 text-sm text-muted"><SquarePlus className="mt-0.5 size-4 shrink-0" /> Offline, the app shows a friendly offline screen. For your security, bookings, payouts and personal details are never stored for offline use.</p>
      </section>
    </>
  );
}
