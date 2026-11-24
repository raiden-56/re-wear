import type { Prisma } from "@prisma/client";
import { db, type DbOrTx } from "./db";

export type Actor = { id: string; role: string };

/** System actor for webhooks, cron and automated transitions. */
export const SYSTEM_ACTOR: Actor = { id: "system", role: "SYSTEM" };

export async function audit(
  client: DbOrTx,
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string | null,
  data: { before?: unknown; after?: unknown; ip?: string | null } = {},
) {
  await client.auditLog.create({
    data: {
      actorId: actor && actor.id !== "system" ? actor.id : null,
      actorRole: actor?.role ?? null,
      action,
      entityType,
      entityId,
      before: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: data.ip ?? null,
    },
  });
}

export const auditNow = (actor: Actor | null, action: string, entityType: string, entityId: string | null, data?: { before?: unknown; after?: unknown }) =>
  audit(db, actor, action, entityType, entityId, data);
