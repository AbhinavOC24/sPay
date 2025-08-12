/*
  Warnings:

  - A unique constraint covering the columns `[address]` on the table `Charge` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Charge_address_key" ON "public"."Charge"("address");
