import { LogoMark } from "@/components/brand/logo";
import { PrintButton } from "@/components/print-button";
import { getSetting } from "@/server/settings";

export default async function ReceiptLayout({ children }: { children: React.ReactNode }) {
  const brand = await getSetting("branding");
  return (
    <main className="min-h-screen bg-cream py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none sm:p-12">
        <div className="flex items-start justify-between border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <LogoMark className="size-10" />
            <div>
              <div className="font-display text-xl font-extrabold">ReWear</div>
              <div className="text-xs text-muted">{brand.address}</div>
            </div>
          </div>
          <PrintButton />
        </div>
        {children}
        <div className="mt-10 border-t border-line pt-4 text-xs text-muted">Computer-generated document. Questions: {brand.supportEmail} · {brand.supportPhone}</div>
      </div>
    </main>
  );
}
