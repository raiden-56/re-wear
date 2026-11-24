import { WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 text-center">
      <LogoMark className="size-14" />
      <WifiOff className="mt-8 size-8 text-muted" />
      <h1 className="mt-4 text-3xl font-bold">You're offline</h1>
      <p className="mt-2 max-w-sm text-muted">ReWear needs a connection to book pickups, show payments or record weights. Your data is safe — reconnect and try again.</p>
      <a href="/" className="mt-6 rounded-full bg-forest px-6 py-3 text-sm font-medium text-white">Try again</a>
    </main>
  );
}
