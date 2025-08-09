/*
  Warnings:

  - You are about to drop the column `webhookAttempts` on the `Charge` table. All the data in the column will be lost.
  - You are about to drop the column `webhookLastStatus` on the `Charge` table. All the data in the column will be lost.
  - You are about to drop the column `webhookSecret` on the `Charge` table. All the data in the column will be lost.
  - You are about to drop the column `webhookUrl` on the `Charge` table. All the data in the column will be lost.
  - Added the required column `merchantid` to the `Charge` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Charge" DROP COLUMN "webhookAttempts",
DROP COLUMN "webhookLastStatus",
DROP COLUMN "webhookSecret",
DROP COLUMN "webhookUrl",
ADD COLUMN     "merchantid" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "payoutStxAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "public"."Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_apiKey_key" ON "public"."Merchant"("apiKey");

-- AddForeignKey
ALTER TABLE "public"."Charge" ADD CONSTRAINT "Charge_merchantid_fkey" FOREIGN KEY ("merchantid") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
