"use client";

import * as React from "react";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type PwaState = {
  online: boolean;
  canInstall: boolean;
  installed: boolean;
  isIos: boolean;
  install: () => Promise<void>;
};

const Ctx = React.createContext<PwaState>({ online: true, canInstall: false, installed: false, isIos: false, install: async () => {} });
export const usePwa = () => React.useContext(Ctx);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = React.useState(true);
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const on = () => {
      setOnline(true);
      toast.success("You're back online");
    };
    const off = () => setOnline(false);
    const bip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("ReWear installed");
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("beforeinstallprompt", bip);
    window.addEventListener("appinstalled", appInstalled);

    // Service worker with update prompt.
    if ("serviceWorker" in navigator && process.env.NEXT_PUBLIC_STATIC_PREVIEW !== "true" && (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "true")) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        const promptUpdate = (worker: ServiceWorker) =>
          toast("A new version of ReWear is ready", {
            duration: Infinity,
            action: { label: "Update", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
          });
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) promptUpdate(w);
          });
        });
        setInterval(() => reg.update().catch(() => null), 60 * 60 * 1000);
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", bip);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, []);

  const install = React.useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  return (
    <Ctx.Provider value={{ online, canInstall: !!deferred, installed, isIos, install }}>
      {!online && (
        <div role="status" className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-charcoal px-4 py-2 text-sm text-white">
          <WifiOff className="size-4" /> You're offline. Bookings and payments need a connection — we'll reconnect automatically.
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
