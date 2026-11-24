import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "ReWear — Clear your wardrobe. Earn from every KG.", template: "%s · ReWear" },
  description: "Sell old clothes by the kilogram with free doorstep pickup, transparent weighing and direct UPI payment. Pre-loved fashion, recycling and B2B textile supply.",
  applicationName: "ReWear",
  appleWebApp: { capable: true, title: "ReWear", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { title: "ReWear", description: "Your old clothes still have value.", type: "website", siteName: "ReWear" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#174B37" }, { color: "#174B37" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${manrope.variable} h-full antialiased`}>
      <head>
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col">
        <PwaProvider>{children}</PwaProvider>
        <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-inter)" } }} />
      </body>
    </html>
  );
}
