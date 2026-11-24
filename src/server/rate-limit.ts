import { db } from "./db";
import { AppError } from "./domain/errors";

/**
 * Fixed-window rate limiter backed by Postgres so it holds across server instances.
 * Uses a single atomic upsert statement per hit.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimitBucket"."resetAt" END,
      "updatedAt" = now()
    RETURNING "count", "resetAt"`;
  const row = rows[0];
  const remaining = Math.max(0, limit - row.count);
  return { allowed: row.count <= limit, remaining, resetAt: row.resetAt };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message = "Too many requests. Please try again shortly.") {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.allowed) throw new AppError("RATE_LIMITED", message, { resetAt: r.resetAt.toISOString() });
  return r;
}
