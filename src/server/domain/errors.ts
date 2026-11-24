export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NOT_SERVICEABLE"
  | "INVALID_STATE"
  | "PROVIDER_ERROR";

/** Expected, user-presentable business error. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export function invariant(cond: unknown, code: ErrorCode, message: string): asserts cond {
  if (!cond) throw new AppError(code, message);
}
