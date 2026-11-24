import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;
export type DbOrTx = PrismaClient | Tx;

/** Run work in a serializable-safe interactive transaction with sane timeouts. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>, opts?: { isolationLevel?: Prisma.TransactionIsolationLevel }) {
  return db.$transaction(fn, { maxWait: 10_000, timeout: 20_000, ...opts });
}

export const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
