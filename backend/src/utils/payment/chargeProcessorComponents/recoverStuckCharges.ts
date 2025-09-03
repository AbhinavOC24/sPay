import { safeDbOperation } from "../../dbChecker/dbChecker";
import prisma from "../../../db";
import { markChargeFailed } from "../markChargeFailed";
import { checkTxStatus } from "../../blockchain/checkTxStatus";
import { transferSbtc } from "../../blockchain/transferSbtc";
// Recovery function to handle stuck transactions
export async function recoverStuckCharges(isShuttingDown: boolean) {
  const stuckCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: {
          status: "PAYOUT_INITIATED",
          lastProcessedAt: {
            lt: new Date(Date.now() - 5 * 60 * 1000), // older than 5 min
          },
        },
        include: { merchant: true },
      }),
    "recoverStuckCharges:findMany"
  );

  if (!stuckCharges || !stuckCharges.length) {
    console.log("[RECOVERY] ✅ No stuck charges found");
    return;
  }

  console.log(
    `[RECOVERY] 🔧 Found ${stuckCharges.length} potentially stuck charges`
  );

  for (const charge of stuckCharges) {
    if (isShuttingDown) break;

    console.log(`[RECOVERY] 🔍 Checking stuck charge ${charge.chargeId}`);

    try {
      // 1. Bail out if too old
      const maxLifetime = 2 * 60 * 60 * 1000; // 2 hours
      const age = Date.now() - new Date(charge.createdAt).getTime();
      if (age > maxLifetime) {
        await markChargeFailed(
          charge.chargeId,
          "Recovery aborted: exceeded max retry window (2h)"
        );
        console.error(
          `[RECOVERY] 💀 Charge ${charge.chargeId} marked FAILED after 2h of retries`
        );
        continue;
      }

      // 2. Check current tx status if we have a payoutTxId
      if (charge.payoutTxId) {
        const txStatus = await checkTxStatus(charge.payoutTxId);

        if (txStatus.isSuccess) {
          await safeDbOperation(
            () =>
              prisma.charge.update({
                where: { id: charge.id },
                data: {
                  status: "PAYOUT_CONFIRMED",
                  payoutConfirmedAt: new Date(),
                  lastProcessedAt: new Date(),
                },
              }),
            `recoverStuckCharges:confirm:${charge.chargeId}`
          );
          console.log(
            `[RECOVERY] ✅ Charge ${charge.chargeId} recovered — tx ${charge.payoutTxId} was successful`
          );
          continue;
        }

        if (txStatus.isFailed) {
          console.log(
            `[RECOVERY] ❌ Tx ${charge.payoutTxId} failed for charge ${charge.chargeId}, rebroadcasting...`
          );
        } else {
          console.log(
            `[RECOVERY] ⏳ Tx ${charge.payoutTxId} still pending for charge ${charge.chargeId}, rebroadcasting...`
          );
        }
      } else {
        console.log(
          `[RECOVERY] ⚠️ Charge ${charge.chargeId} has no payoutTxId, rebroadcasting...`
        );
      }

      // 3. Rebroadcast if we got here
      if (!charge.privKey || !charge.merchant?.payoutStxAddress) {
        await markChargeFailed(
          charge.chargeId,
          "Recovery failed: missing privKey or payout address"
        );
        console.error(
          `[RECOVERY] ❌ Skipping charge ${charge.chargeId} — missing privKey or payout address`
        );
        continue;
      }

      const { txid: newTxid } = await transferSbtc(
        charge.privKey,
        charge.address,
        charge.merchant.payoutStxAddress,
        charge.amount
      );

      await safeDbOperation(
        () =>
          prisma.charge.update({
            where: { id: charge.id },
            data: {
              payoutTxId: newTxid,
              lastProcessedAt: new Date(),
              failureReason: null,
            },
          }),
        `recoverStuckCharges:rebroadcast:${charge.chargeId}`
      );

      console.log(
        `[RECOVERY] 📤 Re-broadcasted payout for charge ${charge.chargeId}, new txid: ${newTxid}`
      );
    } catch (err: any) {
      console.error(
        `[RECOVERY] ❌ Recovery failed for charge ${charge.chargeId}:`,
        err.message || err
      );
    }

    // small delay between charges
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
