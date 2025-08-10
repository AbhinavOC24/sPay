/*
  Warnings:

  - A unique constraint covering the columns `[merchantid,idempotencyKey]` on the table `Charge` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotencyKey` to the `Charge` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Charge" ADD COLUMN     "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Charge_merchantid_idempotencyKey_key" ON "public"."Charge"("merchantid", "idempotencyKey");
