import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isAppError, type ErrorCode } from "./domain/errors";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  NOT_SERVICEABLE: 422,
  INVALID_STATE: 409,
  PROVIDER_ERROR: 502,
};

/** Uniform JSON error responses for route handlers. */
export function apiError(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request" }, { status: 422 });
  if (isAppError(e)) return NextResponse.json({ error: e.message, code: e.code }, { status: STATUS[e.code] });
  console.error(e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export const noStore = { "Cache-Control": "private, no-store" };
