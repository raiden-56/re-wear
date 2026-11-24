import { AppError } from "./errors";
import { assertDeductionAllowed } from "./pickup-policy";

export type RateLine = { categoryId: string; name: string; grams: number; ratePaisePerKg: number; pricingRuleId?: string | null };
export type ValuationLine = RateLine & { subtotalPaise: number };
export type Deduction = { reason: string; amountPaise: number };

/** Money for a weight at a per-kg rate, rounded to the nearest paisa (half-up). */
export function lineAmountPaise(grams: number, ratePaisePerKg: number) {
  if (grams < 0 || ratePaisePerKg < 0) throw new AppError("VALIDATION", "Weight and rate must be non-negative.");
  return Math.round((grams * ratePaisePerKg) / 1000);
}

export function buildValuation(
  lines: RateLine[],
  deductions: Deduction[] = [],
  policy: { deductionsAllowed: boolean; allowedReasons: string[]; maxDeductionPct: number } = {
    deductionsAllowed: false,
    allowedReasons: [],
    maxDeductionPct: 0,
  },
) {
  const valued: ValuationLine[] = lines.map((l) => ({ ...l, subtotalPaise: lineAmountPaise(l.grams, l.ratePaisePerKg) }));
  const subtotalPaise = valued.reduce((s, l) => s + l.subtotalPaise, 0);
  for (const d of deductions) {
    assertDeductionAllowed(d.reason, policy);
    if (!Number.isInteger(d.amountPaise) || d.amountPaise <= 0) throw new AppError("VALIDATION", "Deductions must be positive amounts.");
  }
  const deductionPaise = deductions.reduce((s, d) => s + d.amountPaise, 0);
  if (deductionPaise > Math.floor((subtotalPaise * policy.maxDeductionPct) / 100)) {
    throw new AppError("VALIDATION", `Deductions cannot exceed ${policy.maxDeductionPct}% of the valuation.`);
  }
  const payablePaise = subtotalPaise - deductionPaise;
  return { lines: valued, subtotalPaise, deductionPaise, payablePaise, deductions };
}

/** Estimate for the customer before pickup — same arithmetic as the final valuation. */
export function estimate(lines: RateLine[]) {
  const valued = lines.map((l) => ({ ...l, subtotalPaise: lineAmountPaise(l.grams, l.ratePaisePerKg) }));
  return { lines: valued, totalPaise: valued.reduce((s, l) => s + l.subtotalPaise, 0), totalGrams: valued.reduce((s, l) => s + l.grams, 0) };
}

/** Split a total estimated weight across chosen categories evenly (gram-exact). */
export function splitEvenly(totalGrams: number, categoryIds: string[]) {
  if (categoryIds.length === 0) return [];
  const base = Math.floor(totalGrams / categoryIds.length);
  let remainder = totalGrams - base * categoryIds.length;
  return categoryIds.map((categoryId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { categoryId, grams: base + extra };
  });
}
