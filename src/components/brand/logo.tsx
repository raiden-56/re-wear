import { cn } from "@/lib/utils";

/** ReWear mark: a hanger whose hook loops back into a return arrow. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="var(--forest)" />
      <path d="M20 12.5a3 3 0 1 1 3 3c-1.1 0-3 .7-3 2.6v1.2" fill="none" stroke="var(--amber)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 19.3 9.5 26.2c-.9.6-.5 2 .6 2h19.8c1.1 0 1.5-1.4.6-2L20 19.3Z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className={cn("font-display text-[19px] font-extrabold tracking-tight", light ? "text-white" : "text-charcoal")}>
        Re<span className={light ? "text-amber" : "text-forest"}>Wear</span>
      </span>
    </span>
  );
}
