-- CreateTable
CREATE TABLE "public"."Charge" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "privKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Charge_chargeId_key" ON "public"."Charge"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_address_key" ON "public"."Charge"("address");
