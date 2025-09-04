import {
  isDatabaseConnectionError,
  safeDbOperation,
} from "../../dbChecker/dbChecker";
import prisma from "../../../db";
import { transferSbtc } from "../../blockchain/transferSbtc";
// Step 2: Process confirmed charges and initiate payouts
export async function processPayoutInitiated(isShuttingDown: boolean) {
  const confirmedCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: { status: "CONFIRMED" },
        include: { merchant: true },
        orderBy: { lastProcessedAt: "asc" },
        take: 10,
      }),
    "processPayoutInitiated:findMany"
  );

  if (!confirmedCharges) {
    console.log("Could not fetch confirmed charges, skipping this batch");
    return;
  }

  console.log(
    `Found ${confirmedCharges.length} confirmed charges ready for payout`
  );

  for (const charge of confirmedCharges) {
    if (isShuttingDown) break;

    try {
      // 1) Atomically claim the job: CONFIRMED -> PAYOUT_INITIATED
      const claim = await safeDbOperation(
        () =>
          prisma.charge.update({
            where: { id: charge.id, status: "CONFIRMED" },
            data: {
              status: "PAYOUT_INITIATED",
              lastProcessedAt: new Date(),
            },
          }),
        `processPayoutInitiated:claim:${charge.chargeId}`
      );

      if (!claim) {
        console.log(
          ` Charge ${charge.chargeId} not claimed (status changed or db error)`
        );
        continue;
      }

      console.log(` Initiating payout for charge ${charge.chargeId}`);

      if (!charge.privKey) {
        throw new Error(
          `Missing temp wallet privKey for charge ${charge.chargeId}`
        );
      }
      if (!charge.merchant?.payoutStxAddress) {
        throw new Error(
          `Missing merchant payout address for charge ${charge.chargeId}`
        );
      }

      const { txid } = await transferSbtc(
        charge.privKey,
        charge.address,
        charge.merchant.payoutStxAddress,
        charge.amount
      );

      const updated = await safeDbOperation(
        () =>
          prisma.charge.update({
            where: { id: charge.id },
            data: { payoutTxId: txid, lastProcessedAt: new Date() },
          }),
        `processPayoutInitiated:updateTxId:${charge.chargeId}`
      );

      if (updated) {
        console.log(
          `📤 SBTC payout initiated for charge ${charge.chargeId}, txid: ${txid}`
        );
      }

      // Add delay between payouts
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(
        `❌ Error initiating payout for charge ${charge.chargeId}:`,
        error
      );

      // Roll back the claim or mark failed (only if not connection error)
      if (!isDatabaseConnectionError(error)) {
        try {
          await safeDbOperation(
            () =>
              prisma.charge.update({
                where: { id: charge.id },
                data: {
                  failureReason: `Payout initiation failed: ${String(error)}`,
                  lastProcessedAt: new Date(),
                },
              }),
            `processPayoutInitiated:recordFailure:${charge.chargeId}`
          );

          //     prisma.charge.updateMany({
          //       where: { id: charge.id, status: "PAYOUT_INITIATED" },
          //       data: {
          //         status: "FAILED",
          //         failureReason: `Payout initiation failed: ${String(error)}`,
          //         lastProcessedAt: new Date(),
          //       },
          //     }),
          //   `processPayoutInitiated:rollback:${charge.chargeId}`
          // );
        } catch (e2) {
          console.error("Rollback after payout-init failure also failed:", e2);
        }
      }
    }
  }
}
