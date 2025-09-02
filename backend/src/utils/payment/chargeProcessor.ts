import prisma from "../../db";
import axios from "axios";
import { deliverChargeConfirmedWebhook } from "./deliverChargeWebhook";
import { transferSbtc } from "../blockchain/transferSbtc";
import { checkTxStatus } from "../blockchain/checkTxStatus";
// import { publishChargeUpdate } from "./publishChargeUpdate";
import {
  safeDbOperation,
  isDatabaseConnectionError,
  checkDatabaseHealth,
  handleDatabaseReconnection,
} from "../dbChecker/dbChecker";
import { hasRequiredSbtcBalance } from "../blockchain/checksBTC";
const HIRO_API_BASE = "https://api.testnet.hiro.so";

// - 🔄 **State machine** – moves charges through their lifecycle:
//   - PENDING → CONFIRMED (payment detected)
//   - CONFIRMED → PAYOUT_INITIATED (payout tx broadcast)
//   - PAYOUT_INITIATED → PAYOUT_CONFIRMED (tx confirmed on-chain)
//   - PAYOUT_CONFIRMED → COMPLETED (webhook delivered + finalized)

import { markChargeFailed } from "./markChargeFailed";
import { deriveHotWallet } from "../blockchain/deriveHotWallet";
import { transferAllStx } from "../blockchain/transferStx";
// flags to prevent race conditions
let isProcessing = false;
let isShuttingDown = false;

export function startChargeProcessor() {
  let consecutiveFailures = 0;
  let pollerTimeout: NodeJS.Timeout | null = null;
  let recoveryTimer: ReturnType<typeof setInterval> | null = null;

  const maxFailures = 5;

  // Graceful shutdown handler
  const gracefulShutdown = async () => {
    console.log("🛑 Shutting down charge processor gracefully...");
    isShuttingDown = true;

    if (pollerTimeout) {
      clearTimeout(pollerTimeout);
    }
    if (recoveryTimer) clearInterval(recoveryTimer);

    // Wait for current processing to finish
    let waitCount = 0;
    while (isProcessing && waitCount < 30) {
      // Wait max 30 seconds
      await new Promise((resolve) => setTimeout(resolve, 1000));
      waitCount++;
    }

    try {
      await prisma.$disconnect();
      console.log("✅ Database disconnected cleanly");
    } catch (e) {
      console.warn("⚠️ Error during database disconnect:", e);
    }

    console.log("✅ Charge processor shut down complete");
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  async function pollWithRetry() {
    if (isShuttingDown) return;

    try {
      await processPendingCharges();
      consecutiveFailures = 0;
      console.log(`✅ Processing cycle completed successfully`);
    } catch (error: any) {
      consecutiveFailures++;
      console.error(
        `💥 Poller error (failure #${consecutiveFailures}):`,
        error?.message
      );

      if (isDatabaseConnectionError(error)) {
        console.log(
          "🔌 Database connection error detected, attempting recovery..."
        );
        try {
          await handleDatabaseReconnection();
          console.log("✅ Database reconnection successful, continuing...");
        } catch (reconnectError) {
          console.error("❌ Database reconnection failed:", reconnectError);
          if (consecutiveFailures >= maxFailures) {
            console.error("💀 Too many failures, shutting down...");
            await gracefulShutdown();
            return;
          }
        }
      }

      if (consecutiveFailures >= maxFailures) {
        console.error(
          `💥 Too many consecutive failures (${maxFailures}), shutting down gracefully`
        );
        await gracefulShutdown();
        return;
      }
    }

    if (isShuttingDown) return;

    // Calculate next poll interval with exponential backoff
    const baseInterval = Number(process.env.POLL_INTERVAL_MS || 10000); // 30 seconds base
    const backoffMultiplier = Math.min(consecutiveFailures, 4); // Cap at 4x
    const nextInterval = baseInterval * Math.pow(1.5, backoffMultiplier); // Gentler backoff

    console.log(`⏰ Next poll in ${Math.round(nextInterval / 1000)} seconds`);
    pollerTimeout = setTimeout(pollWithRetry, nextInterval);
  }

  // Initial health checks
  console.log("🚀 Starting charge processor...");
  checkDatabaseHealth()
    .then((healthy) => {
      if (healthy) {
        console.log("✅ Initial database health check passed, starting poller");
        pollWithRetry();
        // Start recovery timer (every 30 min by default)
        const RECOVERY_INTERVAL_MS = Number(
          process.env.RECOVERY_INTERVAL_MS || 30 * 60 * 1000
        );
        recoveryTimer = setInterval(async () => {
          if (!isProcessing && !isShuttingDown) {
            try {
              await recoverStuckCharges();
            } catch (err) {
              console.error("❌ Recovery cycle failed:", err);
            }
          } else {
            console.log(
              "⏳ Skipping recovery (processor busy or shutting down)"
            );
          }
        }, RECOVERY_INTERVAL_MS);
      } else {
        console.error(
          "❌ Initial database health check failed, retrying in 10 seconds"
        );
        setTimeout(() => startChargeProcessor(), 10000);
      }
    })
    .catch((error) => {
      console.error("❌ Failed to start charge processor:", error);
      setTimeout(() => startChargeProcessor(), 10000);
    });
}

// Main function - processes all pending charges through the state machine
export async function processPendingCharges() {
  if (isProcessing) {
    console.log("Charge processing already in progress, skipping...");
    return;
  }

  if (isShuttingDown) {
    console.log("Service is shutting down, skipping charge processing...");
    return;
  }

  isProcessing = true;

  try {
    await expireOldCharges();

    await processNewPayments(); // PENDING → CONFIRMED
    await processPayoutInitiated(); // CONFIRMED → PAYOUT_INITIATED
    await processPayoutConfirmed(); // PAYOUT_INITIATED → PAYOUT_CONFIRMED → COMPLETED
  } catch (error) {
    console.error("Error in processPendingCharges:", error);

    if (isDatabaseConnectionError(error)) {
      console.error(
        "Database connection error in main processor, will retry with backoff"
      );
      throw error;
    }
  } finally {
    isProcessing = false;
  }
}

// Step 1: Check for new payments and mark as confirmed
async function processNewPayments() {
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

// Step 2: Process confirmed charges and initiate payouts
async function processPayoutInitiated() {
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
    console.log("⚠️ Could not fetch confirmed charges, skipping this batch");
    return;
  }

  console.log(
    `🔄 Found ${confirmedCharges.length} confirmed charges ready for payout`
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
          `⚠️ Charge ${charge.chargeId} not claimed (status changed or db error)`
        );
        continue;
      }

      console.log(`🚀 Initiating payout for charge ${charge.chargeId}`);

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
      // console.log("TX id form transferSbtc", txid); for debugging if sBTC tx'ed from ephermal to merchant

      const updated = await safeDbOperation(
        () =>
          prisma.charge.update({
            where: { id: charge.id },
            data: { payoutTxId: txid, lastProcessedAt: new Date() },
          }),
        `processPayoutInitiated:updateTxId:${charge.chargeId}`
      );

      if (updated) {
        // try {
        //   console.log("Pushing from processPayoutInitited");

        //   await publishChargeUpdate(charge.chargeId);
        // } catch (e) {
        //   console.error("Emit/public update failed for", charge.chargeId, e);
        // }

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
              prisma.charge.updateMany({
                where: { id: charge.id, status: "PAYOUT_INITIATED" },
                data: {
                  status: "FAILED",
                  failureReason: `Payout initiation failed: ${String(error)}`,
                  lastProcessedAt: new Date(),
                },
              }),
            `processPayoutInitiated:rollback:${charge.chargeId}`
          );
        } catch (e2) {
          console.error("Rollback after payout-init failure also failed:", e2);
        }
      }
    }
  }
}

// Step 3: Check payout confirmations
async function processPayoutConfirmed() {
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
          await markChargeFailed(
            charge.chargeId,
            `Payout transaction timeout after ${timeoutMs / 1000 / 60} minutes`
          );
          console.error(`⏰ Payout timeout for charge ${charge.chargeId}`);
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

// Retry failed webhooks for payout confirmed charges
export async function retryFailedWebhooks() {
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

// Recovery function to handle stuck transactions

export async function recoverStuckCharges() {
  const stuckCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: {
          status: "PAYOUT_INITIATED",
          lastProcessedAt: {
            lt: new Date(Date.now() - 30 * 60 * 1000), // older than 30 mins
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

      // If we got here: failed, missing, or stuck → try re-broadcast
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

// mark old pending charges as expired + refund gas fees
export async function expireOldCharges() {
  const expiredCharges = await prisma.charge.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    select: {
      chargeId: true,
      privKey: true,
    },
  });

  if (!expiredCharges.length) return;

  // mark them as expired
  const expired = await prisma.charge.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  console.log(`⏳ Marked ${expired.count} charges as EXPIRED`);

  // refund fee buffers
  try {
    const { stxAddress: hotAddr } = await deriveHotWallet(
      process.env.mnemonicString as string
    );

    for (const c of expiredCharges) {
      try {
        console.log(`♻️ Refunding fee buffer for expired charge ${c.chargeId}`);
        await transferAllStx(c.privKey as string, hotAddr);
      } catch (err) {
        console.error(`⚠️ Failed refund for ${c.chargeId}:`, err);
      }
    }
  } catch (err) {
    console.error("⚠️ Failed hot wallet derivation in expireOldCharges:", err);
  }
}
