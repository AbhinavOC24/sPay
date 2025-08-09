-- AlterTable
ALTER TABLE "public"."Charge" ADD COLUMN     "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webhookLastStatus" TEXT;
