/*
  Warnings:

  - You are about to drop the column `isManual` on the `Charge` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Charge" DROP COLUMN "isManual",
ADD COLUMN     "webhookDelivery" BOOLEAN NOT NULL DEFAULT false;
