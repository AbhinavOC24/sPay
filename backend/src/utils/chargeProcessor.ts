import { prisma } from "./prisma-client";
import axios from "axios";
import { deliverChargeConfirmedWebhook } from "./deliverChargeWebhook";
import { transferSbtc } from "./transferSbtc";
import { checkTxStatus } from "./checkTxStatus";

const HIRO_API_BASE = "https://api.testnet.hiro.so";
//PENDING → CONFIRMED → PAYOUT_INITIATED → PAYOUT_CONFIRMED → COMPLETED

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 second

// Add a simple in-memory flag to prevent concurrent polling
let isProcessing = false;

// Main function - processes all pending charges through the state machine
export async function processPendingCharges() {
  // Prevent concurrent execution
  if (isProcessing) {
    console.log("Charge processing already in progress, skipping...");
    return;
  }

  isProcessing = true;

  try {
    // Process different statuses separately to ensure proper order
    await processNewPayments(); // PENDING → CONFIRMED
    await processPayoutInitiated(); // CONFIRMED → PAYOUT_INITIATED
    await processPayoutConfirmed(); // PAYOUT_INITIATED → PAYOUT_CONFIRMED → COMPLETED
  } catch (error) {
    console.error("Error in processPendingCharges:", error);
    throw error;
  } finally {
    isProcessing = false;
  }
}

// Step 1: Check for new payments and mark as confirmed
async function processNewPayments() {
  const pendingCharges = await prisma.charge.findMany({
    where: { status: "PENDING" },
    include: { merchant: true },
  });

  console.log(`📋 Found ${pendingCharges.length} pending charges to check`);

  for (const charge of pendingCharges) {
    try {
      const paid = await hasRequiredSbtcBalance(charge.address, charge.amount);
      if (paid) {
        // Use database transaction to ensure atomicity
        await prisma.$transaction(async (tx) => {
          // Mark as confirmed
          const updated = await tx.charge.update({
            where: { id: charge.id },
            data: {
              status: "CONFIRMED",
              paidAt: new Date(),
              lastProcessedAt: new Date(),
            },
            include: { merchant: true },
          });

          console.log(`💰 Charge ${charge.chargeId} payment confirmed`);

          // Validate prerequisites for payout
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
        });
      }
    } catch (error) {
      console.error(
        `❌ Error processing payment confirmation for charge ${charge.chargeId}:`,
        error
      );
      // Mark as failed for manual intervention
      await markChargeFailed(
        charge.chargeId,
        `Payment confirmation failed: ${error}`
      );
    }
  }
}

// Step 2: Process confirmed charges and initiate payouts
async function processPayoutInitiated() {
  const confirmedCharges = await prisma.charge.findMany({
    where: { status: "CONFIRMED" },
    include: { merchant: true },
  });

  console.log(
    `🔄 Found ${confirmedCharges.length} confirmed charges ready for payout`
  );

  for (const charge of confirmedCharges) {
    try {
      await prisma.$transaction(async (tx) => {
        // Mark as payout initiated to prevent double processing
        const updated = await tx.charge.update({
          where: {
            id: charge.id,
            status: "CONFIRMED", // Ensure status hasn't changed
          },
          data: {
            status: "PAYOUT_INITIATED",
            lastProcessedAt: new Date(),
          },
          include: { merchant: true },
        });

        // If update affected 0 rows, another process got it
        if (!updated) {
          console.log(`⚠️ Charge ${charge.chargeId} already being processed`);
          return;
        }

        console.log(`🚀 Initiating payout for charge ${charge.chargeId}`);

        // Initiate the SBTC transfer
        const { txid } = await transferSbtc(
          updated.privKey!,
          updated.address,
          updated.merchant!.payoutStxAddress!,
          updated.amount
        );

        // Store the transaction ID
        await tx.charge.update({
          where: { id: charge.id },
          data: {
            payoutTxId: txid,
            lastProcessedAt: new Date(),
          },
        });

        console.log(
          `📤 SBTC payout initiated for charge ${charge.chargeId}, txid: ${txid}`
        );
      });
    } catch (error) {
      console.error(
        `❌ Error initiating payout for charge ${charge.chargeId}:`,
        error
      );
      await markChargeFailed(
        charge.chargeId,
        `Payout initiation failed: ${error}`
      );
    }
  }
}

// Step 3: Check payout confirmations

async function processPayoutConfirmed() {
  const payoutInitiatedCharges = await prisma.charge.findMany({
    where: {
      status: "PAYOUT_INITIATED",
      payoutTxId: { not: null },
    },
    include: { merchant: true },
  });

  console.log(
    `🔍 Found ${payoutInitiatedCharges.length} payouts to check for confirmation`
  );

  for (const charge of payoutInitiatedCharges) {
    try {
      if (!charge.payoutTxId) continue;

      // ✅ Non-blocking transaction status check
      const txStatus = await checkTxStatus(charge.payoutTxId);

      if (txStatus.isSuccess) {
        // First, update to PAYOUT_CONFIRMED in a separate transaction
        const updatedCharge = await prisma.charge.update({
          where: { id: charge.id },
          data: {
            status: "PAYOUT_CONFIRMED",
            payoutConfirmedAt: new Date(),
            lastProcessedAt: new Date(),
          },
          include: { merchant: true },
        });

        console.log(`✅ SBTC payout confirmed for charge ${charge.chargeId}`);

        // Then handle webhook delivery OUTSIDE of any transaction
        const hasWebhook =
          !!updatedCharge.merchant?.webhookUrl &&
          !!updatedCharge.merchant?.webhookSecret;

        if (hasWebhook) {
          try {
            await deliverChargeConfirmedWebhook({
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

            // Only after successful webhook, mark as completed
            await prisma.charge.update({
              where: { id: charge.id },
              data: {
                status: "COMPLETED",
                completedAt: new Date(),
              },
            });

            console.log(`🎉 Charge ${charge.chargeId} fully completed`);
          } catch (webhookError) {
            console.error(
              `📧 Webhook delivery failed for charge ${charge.chargeId}:`,
              webhookError
            );
            // Charge remains in PAYOUT_CONFIRMED status for retry
          }
        } else {
          // No webhook configured, mark as completed immediately
          await prisma.charge.update({
            where: { id: charge.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
            },
          });
          console.log(`✅ Charge ${charge.chargeId} completed (no webhook)`);
        }
      } else if (txStatus.isFailed) {
        // Transaction failed on blockchain
        await markChargeFailed(
          charge.chargeId,
          `Payout transaction failed: ${txStatus.failureReason}`
        );
        console.error(
          `❌ Payout failed for charge ${charge.chargeId}: ${txStatus.failureReason}`
        );
      } else if (txStatus.isPending) {
        // Still pending - check if it's been too long
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
      // If status is "unknown", we'll try again next cycle
    } catch (error) {
      console.error(
        `❌ Error checking payout confirmation for charge ${charge.chargeId}:`,
        error
      );
      // Don't mark as failed immediately - might be temporary API issue
    }
  }
}

// Retry failed webhooks for payout confirmed charges but not completed ie merchant webhook failed
export async function retryFailedWebhooks() {
  const payoutConfirmedCharges = await prisma.charge.findMany({
    where: {
      status: "PAYOUT_CONFIRMED",
      webhookLastStatus: "FAILED",
      webhookAttempts: { lt: 5 }, // Max 5 attempts
    },
    include: { merchant: true },
  });

  console.log(
    `🔄 Found ${payoutConfirmedCharges.length} failed webhooks to retry`
  );

  for (const charge of payoutConfirmedCharges) {
    if (!charge.merchant?.webhookUrl || !charge.merchant?.webhookSecret)
      continue;

    try {
      await deliverChargeConfirmedWebhook({
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

      // Mark as completed on successful webhook
      await prisma.charge.update({
        where: { id: charge.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      console.log(`📧 Webhook retry successful for charge ${charge.chargeId}`);
    } catch (error) {
      console.error(
        `📧 Webhook retry failed for charge ${charge.chargeId}:`,
        error
      );
    }
  }
}

// Helper function to mark charges as failed
async function markChargeFailed(chargeId: string, reason: string) {
  try {
    await prisma.charge.update({
      where: { chargeId },
      data: {
        status: "FAILED",
        failureReason: reason,
        lastProcessedAt: new Date(),
      },
    });
    console.error(`💀 Marked charge ${chargeId} as FAILED: ${reason}`);
  } catch (error) {
    console.error(`❌ Failed to mark charge ${chargeId} as failed:`, error);
  }
}

// Check if an address has enough SBTC balance with retry logic
export async function hasRequiredSbtcBalance(
  address: string,
  requiredAmount: bigint
) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${HIRO_API_BASE}/extended/v1/address/${address}/balances`;
      const { data } = await axios.get(url, {
        timeout: 10000, // 10 second timeout
      });

      const sbtcKey = Object.keys(data.fungible_tokens || {}).find((key) =>
        key.includes("sbtc")
      );

      if (!sbtcKey) return false;

      const balance = BigInt(data.fungible_tokens[sbtcKey].balance || "0");
      const hasEnough = balance >= requiredAmount;

      if (hasEnough) {
        console.log(
          `💰 Address ${address} has sufficient balance: ${balance} >= ${requiredAmount}`
        );
      }

      return hasEnough;
    } catch (error: any) {
      console.error(
        `❌ Attempt ${attempt} failed for balance check of ${address}:`,
        error?.message
      );

      if (attempt === MAX_RETRIES) {
        console.error(
          `❌ Failed to check balance after ${MAX_RETRIES} attempts`
        );
        return false;
      }

      // Exponential backoff
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return false;
}

// Recovery function to handle stuck transactions
export async function recoverStuckCharges() {
  const stuckCharges = await prisma.charge.findMany({
    where: {
      status: "PAYOUT_INITIATED",
      lastProcessedAt: {
        lt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      },
    },
  });

  console.log(`🔧 Found ${stuckCharges.length} potentially stuck charges`);

  for (const charge of stuckCharges) {
    console.log(`🔧 Checking stuck charge ${charge.chargeId}`);

    if (charge.payoutTxId) {
      // Check the transaction status one more time
      const txStatus = await checkTxStatus(charge.payoutTxId);

      if (txStatus.isFailed) {
        await markChargeFailed(
          charge.chargeId,
          `Recovery: Transaction failed - ${txStatus.failureReason}`
        );
      } else if (txStatus.isSuccess) {
        // Transaction succeeded but wasn't processed, update status
        await prisma.charge.update({
          where: { id: charge.id },
          data: {
            status: "PAYOUT_CONFIRMED",
            payoutConfirmedAt: new Date(),
            lastProcessedAt: new Date(),
          },
        });
        console.log(
          `🔧 Recovered stuck charge ${charge.chargeId} - transaction was actually successful`
        );
      }
      // If still pending, let it continue normally
    } else {
      // No transaction ID - something went wrong during initiation
      await markChargeFailed(
        charge.chargeId,
        "Recovery: Missing transaction ID after 30 minutes"
      );
    }
  }
}

// Enhanced poller with retry logic and exponential backoff
export function startChargeProcessor() {
  let consecutiveFailures = 0;
  const maxFailures = 5;

  async function pollWithRetry() {
    try {
      await processPendingCharges();
      consecutiveFailures = 0; // Reset on success
    } catch (error: any) {
      consecutiveFailures++;
      console.error(
        `💥 Poller error (failure #${consecutiveFailures}):`,
        error
      );

      if (consecutiveFailures >= maxFailures) {
        console.error(
          `💥 Too many consecutive failures (${maxFailures}), extending delay`
        );
      }
    }

    // Calculate next poll interval based on consecutive failures
    const baseInterval = 30000; // 30 seconds base
    const backoffMultiplier = Math.min(consecutiveFailures, 4); // Cap at 4x
    const nextInterval = baseInterval * Math.pow(2, backoffMultiplier);

    console.log(`⏰ Next poll in ${nextInterval / 1000} seconds`);
    setTimeout(pollWithRetry, nextInterval);
  }

  // Start the polling
  console.log("🚀 Starting charge processor...");
  pollWithRetry();
}
