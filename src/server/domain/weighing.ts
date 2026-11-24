import { AppError } from "./errors";

export type CategoryWeight = { categoryId: string; grams: number };

export function computeNetGrams(grossGrams: number, tareGrams: number) {
  if (!Number.isInteger(grossGrams) || !Number.isInteger(tareGrams)) throw new AppError("VALIDATION", "Weights must be whole grams.");
  if (grossGrams <= 0) throw new AppError("VALIDATION", "Gross weight must be greater than zero.");
  if (tareGrams < 0) throw new AppError("VALIDATION", "Tare weight cannot be negative.");
  if (tareGrams >= grossGrams) throw new AppError("VALIDATION", "Tare weight must be less than gross weight.");
  return grossGrams - tareGrams;
}

/**
 * Category weights (accepted) + rejected weight must reconcile with net weight
 * within a tolerance (scale rounding / re-bagging). Returns the variance in grams.
 */
export function reconcileCategoryWeights(netGrams: number, weights: CategoryWeight[], rejectedGrams: number, toleranceGrams = 50) {
  if (weights.length === 0) throw new AppError("VALIDATION", "Enter at least one category weight.");
  const seen = new Set<string>();
  for (const w of weights) {
    if (seen.has(w.categoryId)) throw new AppError("VALIDATION", "Each category can only be entered once.");
    seen.add(w.categoryId);
    if (!Number.isInteger(w.grams) || w.grams < 0) throw new AppError("VALIDATION", "Category weights must be zero or more grams.");
  }
  if (rejectedGrams < 0) throw new AppError("VALIDATION", "Rejected weight cannot be negative.");
  const total = weights.reduce((s, w) => s + w.grams, 0) + rejectedGrams;
  const variance = total - netGrams;
  if (Math.abs(variance) > toleranceGrams) {
    throw new AppError(
      "VALIDATION",
      `Category weights (${(total / 1000).toFixed(2)} kg) must add up to the net weight (${(netGrams / 1000).toFixed(2)} kg).`,
      { variance },
    );
  }
  return variance;
}

/** Variance between two weighings, in percent of the reference weight. */
export function variancePercent(reference: number, actual: number) {
  if (reference <= 0) return 0;
  return ((actual - reference) / reference) * 100;
}
