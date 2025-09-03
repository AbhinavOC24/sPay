import prisma from "../../../db";
import { hasRequiredSbtcBalance } from "../../blockchain/checksBTC";
import {
  isDatabaseConnectionError,
  safeDbOperation,
} from "../../dbChecker/dbChecker";
import { markChargeFailed } from "../markChargeFailed";
// Step 1: Check for new payments and mark as confirmed

export async function processNewPayments(isShuttingDown: boolean) {
  const pendingCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: { status: "PENDING" },
        include: { merchant: true },
        orderBy: { lastProcessedAt: "asc" },
        take: 10,
      }),
    "processNewPayments:findMany"
  );

  if (!pendingCharges) {
    console.log("⚠️ Could not fetch pending charges, skipping this batch");
    return;
  }

  console.log(`📋 Found ${pendingCharges.length} pending charges to check`);

  for (const charge of pendingCharges) {
    if (isShuttingDown) break;

    try {
      const paid = await hasRequiredSbtcBalance(charge.address, charge.amount);
      if (paid) {
        const updated = await safeDbOperation(
          () =>
            prisma.$transaction(async (tx) => {
              const updated = await tx.charge.update({
                where: { id: charge.id },
                data: {
                  status: "CONFIRMED",
                  paidAt: new Date(),
                  lastProcessedAt: new Date(),
                },
                include: { merchant: true },
              });

              if (!updated.privKey) {
                throw new Error(
                  `Missing temp wallet privKey for charge ${updated.chargeId}`
                );
              }
              if (!updated.merchant?.payoutStxAddress) {
                throw new Error(
                  `Missing merchant payout address for charge ${updated.chargeId}`
                );
              }

              return updated;
            }),
          `processNewPayments:update:${charge.chargeId}`
        );

        if (updated) {
          console.log(`💰 Charge ${charge.chargeId} payment confirmed`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(
        `❌ Error processing payment confirmation for charge ${charge.chargeId}:`,
        error
      );

      // Only mark as failed if it's not a connection error
      if (!isDatabaseConnectionError(error)) {
        await markChargeFailed(
          charge.chargeId,
          `Payment confirmation failed: ${error}`
        );
      }
    }
  }
}
