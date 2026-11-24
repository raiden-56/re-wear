import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-white", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const tones: Record<Tone, string> = {
  neutral: "bg-cream-200 text-charcoal",
  green: "bg-forest-50 text-forest",
  sage: "bg-sage-100 text-[#2d5a3e]",
  amber: "bg-amber-100 text-[#7a5317]",
  red: "bg-danger-50 text-danger",
  blue: "bg-info-50 text-info",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const m = map[value] ?? { label: value, tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-sage">{eyebrow}</div>}
        <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = "neutral" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "neutral" | "forest" | "amber" }) {
  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5", tone === "forest" ? "border-forest bg-forest text-white" : tone === "amber" ? "border-amber bg-amber-100" : "border-line bg-white")}>
      <div className="flex items-center justify-between">
        <span className={cn("text-[13px]", tone === "forest" ? "text-white/75" : "text-muted")}>{label}</span>
        {Icon && <Icon className={cn("size-4", tone === "forest" ? "text-amber" : "text-sage")} />}
      </div>
      <div className="num mt-2 font-display text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className={cn("mt-1 text-xs", tone === "forest" ? "text-white/70" : "text-muted")}>{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-full bg-forest-50">
          <Icon className="size-5 text-forest" />
        </div>
      )}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("whitespace-nowrap border-b border-line bg-cream/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted", className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn("border-b border-line/70 px-4 py-3 align-middle", className)}>{children}</td>
);

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", active === t.href ? "border-forest text-forest" : "border-transparent text-muted hover:text-charcoal")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-cream-200 px-1.5 py-0.5 text-[11px]">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function KeyValue({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line/70", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{k}</dt>
          <dd className="num text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "success" | "danger"; title?: string; children?: React.ReactNode; className?: string }) {
  const s = { info: "border-info/20 bg-info-50 text-info", warn: "border-amber bg-amber-100 text-[#6b4813]", success: "border-forest/20 bg-forest-50 text-forest", danger: "border-danger/20 bg-danger-50 text-danger" }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", s, className)}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}
