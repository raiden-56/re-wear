import "server-only";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { isAppError } from "./domain/errors";
import { requireUser, type SessionUser } from "./auth/session";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
  ts?: number;
};

export const initialState: ActionState = { ok: false };

/** Turn FormData into a plain object (repeated keys become arrays). */
export function formToObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

/**
 * Standard server action wrapper: authenticate, validate with Zod, run the service,
 * map expected errors to user messages, and revalidate affected paths.
 */
export function authedAction<S extends z.ZodTypeAny>(
  schema: S,
  handler: (user: SessionUser, input: z.infer<S>) => Promise<string | { message?: string; data?: Record<string, unknown> } | void>,
  opts: { revalidate?: string[] } = {},
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    try {
      const user = await requireUser();
      const input = schema.parse(formToObject(formData));
      const res = await handler(user, input);
      for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
      if (typeof res === "string") return { ok: true, message: res, ts: Date.now() };
      return { ok: true, message: res?.message, data: res?.data, ts: Date.now() };
    } catch (e) {
      unstable_rethrow(e);
      return toActionError(e);
    }
  };
}

export function toActionError(e: unknown): ActionState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: e.issues[0]?.message ?? "Please check the form.", fieldErrors, ts: Date.now() };
  }
  if (isAppError(e)) return { ok: false, error: e.message, ts: Date.now() };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again.", ts: Date.now() };
}

// Reusable coercions for FormData strings
export const zs = {
  id: z.string().min(1).max(64),
  text: (max = 500) => z.string().trim().max(max),
  req: (max = 200, msg = "This field is required") => z.string().trim().min(1, msg).max(max),
  int: z.coerce.number().int(),
  kgToGrams: z.coerce.number().min(0).max(100_000).transform((kg) => Math.round(kg * 1000)),
  rupeesToPaise: z.coerce.number().min(0).max(10_000_000).transform((r) => Math.round(r * 100)),
  bool: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  optional: (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : null)),
  list: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string())),
};
