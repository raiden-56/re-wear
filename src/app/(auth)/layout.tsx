import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { images } from "@/lib/images";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" aria-label="ReWear home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-xs text-muted">By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.</p>
      </div>
      <div className="relative hidden lg:block">
        <Image src={images.hangingClothes} alt="Clothes hanging on a rail" fill priority sizes="50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-700/90 via-forest-700/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="font-display text-3xl font-bold leading-tight">“Free pickup. Weighed in front of you. Paid to UPI.”</p>
          <p className="mt-3 text-white/70">The ReWear promise, on every booking.</p>
        </div>
      </div>
    </div>
  );
}
