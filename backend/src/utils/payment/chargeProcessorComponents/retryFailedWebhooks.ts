import { safeDbOperation } from "../../dbChecker/dbChecker";
import prisma from "../../../db";
import { deliverChargeConfirmedWebhook } from "../deliverChargeWebhook";
// Retry failed webhooks for payout confirmed charges
export async function retryFailedWebhooks(isShuttingDown: boolean) {
  const payoutConfirmedCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: {
          status: "PAYOUT_CONFIRMED",
          webhookLastStatus: "FAILED",
          webhookAttempts: { lt: 10 },
        },
        include: { merchant: true },
        orderBy: { lastProcessedAt: "asc" },
        take: 10,
      }),
    "retryFailedWebhooks:findMany"
  );

  if (!payoutConfirmedCharges) return;

  console.log(
    `🔄 Found ${payoutConfirmedCharges.length} failed webhooks to retry`
  );

  for (const charge of payoutConfirmedCharges) {
    if (isShuttingDown) break;
    if (!charge.merchant?.webhookUrl || !charge.merchant?.webhookSecret)
      continue;

    try {
      const ok = await deliverChargeConfirmedWebhook({
        payload: {
          chargeId: charge.chargeId,
          address: charge.address,
          amount: String(charge.amount),
          paidAt: charge.paidAt?.toISOString(),
          payoutTxId: charge.payoutTxId,
        },
        config: {
          url: charge.merchant.webhookUrl,
          secret: charge.merchant.webhookSecret,
        },
      });

      if (ok) {
        await safeDbOperation(
          () =>
            prisma.charge.update({
              where: { id: charge.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            }),
          `retryFailedWebhooks:complete:${charge.chargeId}`
        );
        console.log(
          `📧 Webhook retry successful for charge ${charge.chargeId}`
        );
      } else {
        console.error(
          `📧 Webhook retry still failing for charge ${charge.chargeId}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(
        `📧 Webhook retry failed for charge ${charge.chargeId}:`,
        error
      );
    }
  }
}
