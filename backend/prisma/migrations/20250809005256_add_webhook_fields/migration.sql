/*
  Warnings:

  - You are about to drop the column `webhook` on the `Charge` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Charge" DROP COLUMN "webhook",
ADD COLUMN     "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webhookLastStatus" TEXT,
ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookUrl" TEXT;
