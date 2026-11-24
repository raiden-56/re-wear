import type { LedgerAccount, LedgerDirection } from "@prisma/client";
import type { DbOrTx } from "../db";
import { AppError } from "../domain/errors";

export type Leg = { account: LedgerAccount; direction: LedgerDirection; amountPaise: number };

/**
 * Post a balanced, idempotent double-entry journal. Re-posting the same `key`
 * is a no-op, so retries and duplicate webhooks never double-count money.
 */
export async function postJournal(
  client: DbOrTx,
  entry: {
    key: string;
    referenceType: string;
    referenceId: string;
    description: string;
    legs: Leg[];
    bookingId?: string | null;
    customerId?: string | null;
    actorId?: string | null;
  },
) {
  const debits = entry.legs.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + l.amountPaise, 0);
  const credits = entry.legs.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + l.amountPaise, 0);
  if (debits !== credits || debits <= 0) throw new AppError("VALIDATION", "Journal entry must balance.");
  const exists = await client.financialLedger.findFirst({ where: { entryGroup: entry.key }, select: { id: true } });
  if (exists) return false;
  await client.financialLedger.createMany({
    data: entry.legs.map((l, i) => ({
      entryGroup: entry.key,
      account: l.account,
      direction: l.direction,
      amountPaise: l.amountPaise,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      bookingId: entry.bookingId ?? null,
      customerId: entry.customerId ?? null,
      description: entry.description,
      idempotencyKey: `${entry.key}:${i}`,
      actorId: entry.actorId && entry.actorId !== "system" ? entry.actorId : null,
    })),
    skipDuplicates: true,
  });
  return true;
}

export const dr = (account: LedgerAccount, amountPaise: number): Leg => ({ account, direction: "DEBIT", amountPaise });
export const cr = (account: LedgerAccount, amountPaise: number): Leg => ({ account, direction: "CREDIT", amountPaise });
