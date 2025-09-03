import { safeDbOperation } from "../../dbChecker/dbChecker";
import { deliverChargeConfirmedWebhook } from "../deliverChargeWebhook";
import prisma from "../../../db";
import { checkTxStatus } from "../../blockchain/checkTxStatus";
import { markChargeFailed } from "../markChargeFailed";

// Step 3: Check payout confirmations
export async function processPayoutConfirmed(isShuttingDown: boolean) {
  const payoutInitiatedCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: {
          status: "PAYOUT_INITIATED",
          payoutTxId: { not: null },
        },
        include: { merchant: true },
        orderBy: { lastProcessedAt: "asc" },
        take: 10,
      }),
    "processPayoutConfirmed:findMany"
  );

  if (!payoutInitiatedCharges) {
    console.log(
      "⚠️ Could not fetch payout initiated charges, skipping this batch"
    );
    return;
  }

  console.log(
    `🔍 Found ${payoutInitiatedCharges.length} payouts to check for confirmation`
  );

  for (const charge of payoutInitiatedCharges) {
    if (isShuttingDown) break;

    try {
      if (!charge.payoutTxId) continue;

      const txStatus = await checkTxStatus(charge.payoutTxId, 5);

      if (txStatus.isSuccess) {
        // First, update to PAYOUT_CONFIRMED
        const updatedCharge = await safeDbOperation(
          () =>
            prisma.charge.update({
              where: { id: charge.id },
              data: {
                status: "PAYOUT_CONFIRMED",
                payoutConfirmedAt: new Date(),
                lastProcessedAt: new Date(),
              },
              include: { merchant: true },
            }),
          `processPayoutConfirmed:confirm:${charge.chargeId}`
        );
        // Handle webhook delivery if charge is created from API

        if (updatedCharge) {
          // await publishChargeUpdate(updatedCharge.chargeId);

          const hasWebhook =
            !!updatedCharge.merchant?.webhookUrl &&
            !!updatedCharge.merchant?.webhookSecret;

          if (hasWebhook && updatedCharge.webhookDelivery) {
            try {
              const ok = await deliverChargeConfirmedWebhook({
                payload: {
                  chargeId: updatedCharge.chargeId,
                  address: updatedCharge.address,
                  amount: String(updatedCharge.amount),
                  paidAt: updatedCharge.paidAt?.toISOString(),
                  payoutTxId: updatedCharge.payoutTxId,
                },
                config: {
                  url: updatedCharge.merchant.webhookUrl,
                  secret: updatedCharge.merchant.webhookSecret,
                },
              });

              if (ok) {
                await safeDbOperation(
                  () =>
                    prisma.charge.update({
                      where: { id: charge.id },
                      data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                      },
                    }),
                  `processPayoutConfirmed:complete:${charge.chargeId}`
                );
                console.log(`🎉 Charge ${charge.chargeId} fully completed`);
                console.log("Pushing from processPayoutconfirmed");

                // await publishChargeUpdate(updatedCharge.chargeId);
                console.log(
                  `✅ SBTC payout confirmed for charge ${charge.chargeId}`
                );
              } else {
                console.error(
                  `📧 Webhook delivery failed for charge ${charge.chargeId}, will retry later`
                );
              }
            } catch (webhookError) {
              console.error(
                `📧 Webhook delivery failed for charge ${charge.chargeId}:`,
                webhookError
              );
            }
          } else {
            // No webhook configured, mark as completed immediately
            await safeDbOperation(
              () =>
                prisma.charge.update({
                  where: { id: charge.id },
                  data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                  },
                }),
              `processPayoutConfirmed:completeNoWebhook:${charge.chargeId}`
            );
            // await publishChargeUpdate(updatedCharge.chargeId);

            console.log(`✅ Charge ${charge.chargeId} completed (no webhook)`);
          }
        }
      } else if (txStatus.isFailed) {
        await markChargeFailed(
          charge.chargeId,
          `Payout transaction failed: ${txStatus.failureReason}`
        );
        console.error(
          `❌ Payout failed for charge ${charge.chargeId}: ${txStatus.failureReason}`
        );
      } else if (txStatus.isPending) {
        // Check timeout
        const timeSinceInitiated =
          Date.now() -
          new Date(charge.lastProcessedAt || charge.createdAt).getTime();
        const timeoutMs = 10 * 60 * 1000; // 10 minutes

        if (timeSinceInitiated > timeoutMs) {
          // await markChargeFailed(
          //   charge.chargeId,
          //   `Payout transaction timeout after ${timeoutMs / 1000 / 60} minutes`
          // );
          await safeDbOperation(
            () =>
              prisma.charge.update({
                where: { id: charge.id },
                data: {
                  failureReason: `Payout stuck pending > ${
                    timeoutMs / 1000 / 60
                  } min`,
                  lastProcessedAt: new Date(),
                },
              }),
            `processPayoutConfirmed:stuck:${charge.chargeId}`
          );
          console.error(
            `⏰ Payout still pending for charge ${charge.chargeId}, marked for recovery`
          );
        } else {
          console.log(
            `⏳ Payout still pending for charge ${
              charge.chargeId
            } (${Math.round(timeSinceInitiated / 1000)}s elapsed)`
          );
        }
      }

      // delay between transaction checks
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      console.error(
        `❌ Error checking payout confirmation for charge ${charge.chargeId}:`,
        error
      );
    }
  }
}
