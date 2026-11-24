-- AlterTable
ALTER TABLE "Payout" ALTER COLUMN "upiVpa" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SandboxTransaction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "destination" TEXT,
    "status" TEXT NOT NULL,
    "utr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SandboxTransaction_idempotencyKey_key" ON "SandboxTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxTransaction_reference_key" ON "SandboxTransaction"("reference");
