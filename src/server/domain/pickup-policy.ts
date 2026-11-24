import { AppError } from "./errors";

/**
 * FREE PICKUP — permanent customer-facing policy.
 * The pickup fee is a constant zero. There is deliberately no configuration
 * that can change it; the database also enforces `pickupFeePaise = 0`.
 */
export const PICKUP_FEE_PAISE = 0 as const;

export function assertFreePickup(input: { pickupFeePaise?: number | null }) {
  if (input.pickupFeePaise !== undefined && input.pickupFeePaise !== null && input.pickupFeePaise !== PICKUP_FEE_PAISE) {
    throw new AppError("VALIDATION", "Pickup is always free. A pickup fee can never be applied.");
  }
}

/** Valuation deductions may never be logistics/pickup related. */
const FORBIDDEN_DEDUCTION = /(pick\s*-?\s*up|convenience|collection|logistic|delivery|transport|handling)\s*(fee|charge)?/i;

export function assertDeductionAllowed(reason: string, policy: { deductionsAllowed: boolean; allowedReasons: string[] }) {
  if (FORBIDDEN_DEDUCTION.test(reason)) {
    throw new AppError("VALIDATION", "Pickup, collection or convenience charges can never be deducted from customer earnings.");
  }
  if (!policy.deductionsAllowed) {
    throw new AppError("VALIDATION", "Deductions are not permitted under the current published policy.");
  }
  if (!policy.allowedReasons.includes(reason)) {
    throw new AppError("VALIDATION", `“${reason}” is not a published deduction reason.`);
  }
}

/**
 * Minimum quantity is OFF by default (0 g). Administrators may only introduce one through
 * an explicit, published business-policy change on a service area — never as a fee.
 */
export function checkMinimumQuantity(estimatedGrams: number, minimumKgPolicyGrams: number) {
  if (minimumKgPolicyGrams > 0 && estimatedGrams < minimumKgPolicyGrams) {
    throw new AppError(
      "VALIDATION",
      `Pickups in this area currently need at least ${(minimumKgPolicyGrams / 1000).toFixed(1)} kg. Pickup remains free — no fee applies.`,
    );
  }
}
