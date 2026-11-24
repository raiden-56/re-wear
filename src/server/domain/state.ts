import { AppError } from "./errors";

type Graph<S extends string> = Record<S, readonly S[]>;

export const BOOKING_TRANSITIONS = {
  SCHEDULED: ["ASSIGNED", "CANCELLED", "FAILED"],
  ASSIGNED: ["ASSIGNED", "EN_ROUTE", "SCHEDULED", "CANCELLED", "FAILED"],
  EN_ROUTE: ["IN_PROGRESS", "FAILED", "ASSIGNED"],
  IN_PROGRESS: ["AWAITING_APPROVAL", "COMPLETED", "FAILED"],
  AWAITING_APPROVAL: ["APPROVED", "COMPLETED", "DISPUTED", "RETURNED", "AWAITING_APPROVAL"],
  APPROVED: ["COMPLETED", "AWAITING_APPROVAL"],
  COMPLETED: ["AWAITING_APPROVAL"], // warehouse re-inspection may revise the valuation
  DISPUTED: ["AWAITING_APPROVAL", "APPROVED", "RETURNED", "COMPLETED"],
  RETURNED: [],
  CANCELLED: [],
  FAILED: ["SCHEDULED"],
} as const satisfies Graph<string>;

export type BookingState = keyof typeof BOOKING_TRANSITIONS;

export const PAYOUT_TRANSITIONS = {
  AWAITING_APPROVAL: ["APPROVED", "UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "AWAITING_APPROVAL"],
  APPROVED: ["INITIATED", "UNDER_REVIEW"],
  INITIATED: ["PROCESSING", "SUCCESSFUL", "FAILED"],
  PROCESSING: ["SUCCESSFUL", "FAILED", "REVERSED"],
  SUCCESSFUL: ["REVERSED"],
  FAILED: ["INITIATED", "UNDER_REVIEW"],
  REVERSED: ["INITIATED", "UNDER_REVIEW"],
} as const satisfies Graph<string>;

export type PayoutState = keyof typeof PAYOUT_TRANSITIONS;

/** Payout states from which a new provider attempt may safely be started. */
export const PAYOUT_INITIABLE: PayoutState[] = ["APPROVED", "FAILED", "REVERSED"];

export function canTransition<G extends Graph<string>>(graph: G, from: keyof G & string, to: string) {
  return (graph[from] as readonly string[]).includes(to);
}

export function assertTransition<G extends Graph<string>>(graph: G, from: keyof G & string, to: string, entity = "record") {
  if (!canTransition(graph, from, to)) {
    throw new AppError("INVALID_STATE", `This ${entity} cannot move from ${from.toLowerCase().replace(/_/g, " ")} to ${to.toLowerCase().replace(/_/g, " ")}.`);
  }
}

/** Statuses in which a booking is still upcoming (customer can reschedule / cancel). */
export const BOOKING_MUTABLE: BookingState[] = ["SCHEDULED", "ASSIGNED"];
export const BOOKING_OPEN: BookingState[] = ["SCHEDULED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED", "DISPUTED"];
