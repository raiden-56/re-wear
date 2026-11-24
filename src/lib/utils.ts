import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Format integer paise as Indian Rupees. */
export function formatINR(paise: number | null | undefined, opts: { whole?: boolean } = {}) {
  const v = (paise ?? 0) / 100;
  return opts.whole ? inrWhole.format(Math.round(v)) : inr.format(v);
}

/** Format integer grams as kilograms. */
export function formatKg(grams: number | null | undefined, digits = 2) {
  const kg = (grams ?? 0) / 1000;
  return `${kg.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} kg`;
}

export function formatNumber(n: number | null | undefined) {
  return num.format(n ?? 0);
}

export const kgToGrams = (kg: number) => Math.round(kg * 1000);
export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

export function formatDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}

/** Date-only formatting for @db.Date columns stored as UTC midnight. */
export function formatDay(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function initials(name?: string | null) {
  if (!name) return "RW";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function maskPhone(phone?: string | null) {
  if (!phone) return "—";
  return phone.replace(/^(\+?\d{2,3})\d+(\d{3})$/, "$1•••••$2");
}

export function maskVpa(vpa?: string | null) {
  if (!vpa) return "—";
  const [u, h] = vpa.split("@");
  if (!h) return vpa;
  return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 3))}${u.slice(-1)}@${h}`;
}
