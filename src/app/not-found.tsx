import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 text-center">
      <LogoMark className="size-12" />
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-sage">404</p>
      <h1 className="mt-2 text-3xl font-bold">This page has been recycled.</h1>
      <p className="mt-2 max-w-sm text-muted">We couldn't find what you were looking for — or you don't have access to it.</p>
      <Link href="/" className="mt-6 rounded-full bg-forest px-6 py-3 text-sm font-medium text-white">Back to ReWear</Link>
    </main>
  );
}
