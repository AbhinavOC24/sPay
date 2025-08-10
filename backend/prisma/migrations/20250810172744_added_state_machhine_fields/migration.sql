-- AlterTable
ALTER TABLE "public"."Charge" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "lastProcessedAt" TIMESTAMP(3),
ADD COLUMN     "payoutConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "payoutTxId" TEXT;
