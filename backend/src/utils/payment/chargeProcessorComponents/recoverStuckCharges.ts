import { safeDbOperation } from "../../dbChecker/dbChecker";
import prisma from "../../../db";
import { markChargeFailed } from "../markChargeFailed";
import { checkTxStatus } from "../../blockchain/checkTxStatus";
import { transferSbtc } from "../../blockchain/transferSbtc";

import { deliverChargeConfirmedWebhook } from "../deliverChargeWebhook";

// === Configurable knobs (with sane defaults) ===
type LogLevel = "debug" | "info" | "warn" | "error";

const STUCK_THRESHOLD_MS = Number(
  process.env.RECOVERY_STUCK_THRESHOLD_MS || 5 * 60 * 1000
); // default: 5m
const MAX_LIFETIME_MS = Number(
  process.env.RECOVERY_MAX_LIFETIME_MS || 30 * 60 * 1000
); // default: 30m
const LOOP_DELAY_MS = Number(process.env.RECOVERY_LOOP_DELAY_MS || 200); // delay between charges
const BATCH_SIZE = Number(process.env.RECOVERY_BATCH_SIZE || 10);
const ALLOW_REFUND = (process.env.RECOVERY_ALLOW_REFUND || "true") === "true";
const FORCE_COMPLETE_WEBHOOKS =
  (process.env.RECOVERY_FORCE_COMPLETE_WEBHOOKS || "true") === "true";
const LOG_LEVEL = (process.env.RECOVERY_LOG_LEVEL || "info") as LogLevel; // "info" | "debug" | "warn" | "error"

// RECOVERY_STUCK_THRESHOLD_MS → time since last progress before considered “stuck”

// RECOVERY_MAX_LIFETIME_MS → max charge age before refund/force complete

// RECOVERY_LOOP_DELAY_MS → delay between processing charges

// RECOVERY_BATCH_SIZE → number of stuck charges per loop

// RECOVERY_ALLOW_REFUND → toggle refunding

// RECOVERY_FORCE_COMPLETE_WEBHOOKS → toggle force-completing webhook failures

// RECOVERY_LOG_LEVEL → adjust verbosity (debug, info, warn, error)

function log(level: LogLevel, ...args: any[]) {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  const currentLevel = LOG_LEVEL as LogLevel;

  if (levels.indexOf(level) >= levels.indexOf(currentLevel)) {
    if (level === "debug") console.debug(...args);
    else if (level === "info") console.info(...args);
    else if (level === "warn") console.warn(...args);
    else console.error(...args);
  }
}

export async function recoverStuckCharges(isShuttingDown: boolean) {
  const stuckCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: {
          status: { in: ["PAYOUT_INITIATED", "PAYOUT_CONFIRMED"] },
          lastProcessedAt: {
            lt: new Date(Date.now() - STUCK_THRESHOLD_MS),
          },
        },
        include: { merchant: true },
        take: BATCH_SIZE,
      }),
    "recoverStuckCharges:findMany"
  );

  if (!stuckCharges?.length) {
    log("info", "[RECOVERY] ✅ No stuck charges found");
    return;
  }

  log("info", `[RECOVERY] 🔧 Found ${stuckCharges.length} stuck charges`);

  for (const charge of stuckCharges) {
    if (isShuttingDown) break;
    log("info", `[RECOVERY] 🔍 Handling charge ${charge.chargeId}`);

    try {
      const age = Date.now() - new Date(charge.createdAt).getTime();

      // ================================
      // Case A: PAYOUT_INITIATED
      // ================================
      if (charge.status === "PAYOUT_INITIATED") {
        if (!charge.payoutTxId) {
          log("warn", `[RECOVERY] ⚠️ No payoutTxId → rebroadcasting payout`);
        } else {
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
            log(
              "info",
              `[RECOVERY] ✅ Charge ${charge.chargeId} moved to PAYOUT_CONFIRMED`
            );
            continue;
          }

          if (txStatus.isFailed) {
            log(
              "warn",
              `[RECOVERY] ❌ Tx ${charge.payoutTxId} failed → funds still in ephemeral`
            );
          } else {
            log(
              "info",
              `[RECOVERY] ⏳ Tx ${charge.payoutTxId} still pending → rebroadcasting`
            );
          }
        }

        if (age > MAX_LIFETIME_MS) {
          if (ALLOW_REFUND && charge.payerAddress && charge.privKey) {
            log("warn", `[RECOVERY] 💸 Refunding ${charge.chargeId}`);
            const { txid: refundTxId } = await transferSbtc(
              charge.privKey,
              charge.address,
              charge.payerAddress,
              charge.amount
            );
            await safeDbOperation(
              () =>
                prisma.charge.update({
                  where: { id: charge.id },
                  data: {
                    status: "REFUNDED",
                    lastProcessedAt: new Date(),
                  },
                }),
              `recoverStuckCharges:refund:${charge.chargeId}`
            );
            log(
              "info",
              `[RECOVERY] ✅ Refunded charge ${charge.chargeId}, txid: ${refundTxId}`
            );
          } else {
            await markChargeFailed(
              charge.chargeId,
              "Recovery aborted: expired payout, missing payerAddr/privKey or refund disabled"
            );
          }
          continue;
        }

        // rebroadcast payout attempt
        if (!charge.privKey || !charge.merchant?.payoutStxAddress) {
          await markChargeFailed(
            charge.chargeId,
            "Recovery failed: missing privKey or merchant payout address"
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

        log(
          "info",
          `[RECOVERY] 📤 Rebroadcasted payout for ${charge.chargeId}, new txid: ${newTxid}`
        );
      }

      // ================================
      // Case B: PAYOUT_CONFIRMED
      // ================================
      if (charge.status === "PAYOUT_CONFIRMED") {
        const hasWebhook =
          !!charge.merchant?.webhookUrl && !!charge.merchant?.webhookSecret;

        if (hasWebhook && charge.webhookDelivery) {
          try {
            const ok = await deliverChargeConfirmedWebhook({
              payload: {
                chargeId: charge.chargeId,
                address: charge.address,
                amount: String(charge.amount),
                paidAt: charge.paidAt?.toISOString(),
                payoutTxId: charge.payoutTxId!,
              },
              config: {
                url: charge.merchant.webhookUrl!,
                secret: charge.merchant.webhookSecret!,
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
                `recoverStuckCharges:complete:${charge.chargeId}`
              );
              log(
                "info",
                `[RECOVERY] ✅ Completed charge ${charge.chargeId} after webhook retry`
              );
              continue;
            } else {
              log(
                "warn",
                `[RECOVERY] 📧 Webhook retry failed for ${charge.chargeId}`
              );
            }
          } catch (err) {
            log(
              "error",
              `[RECOVERY] 📧 Webhook retry exception for ${charge.chargeId}:`,
              err
            );
          }
        }

        if (FORCE_COMPLETE_WEBHOOKS && age > MAX_LIFETIME_MS) {
          await safeDbOperation(
            () =>
              prisma.charge.update({
                where: { id: charge.id },
                data: {
                  status: "COMPLETED",
                  completedAt: new Date(),
                  lastProcessedAt: new Date(),
                },
              }),
            `recoverStuckCharges:forceComplete:${charge.chargeId}`
          );
          log(
            "warn",
            `[RECOVERY] ⚠️ Force-completed charge ${charge.chargeId} (payout succeeded but webhook failed)`
          );
        }
      }
    } catch (err: any) {
      log(
        "error",
        `[RECOVERY] ❌ Recovery failed for charge ${charge.chargeId}:`,
        err.message || err
      );
    }

    await new Promise((resolve) => setTimeout(resolve, LOOP_DELAY_MS));
  }
}
