import prisma from "../../db";
import axios from "axios";
import { deliverChargeConfirmedWebhook } from "./deliverChargeWebhook";
import { transferSbtc } from "../blockchain/transferSbtc";
import { checkTxStatus } from "./checkTxStatus";
import { publishChargeUpdate } from "./publishChargeUpdate";

const HIRO_API_BASE = "https://api.testnet.hiro.so";
//PENDING → CONFIRMED → PAYOUT_INITIATED → PAYOUT_CONFIRMED → COMPLETED

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 second

// 🔧 CHANGE 1: Enhanced processing flags to prevent race conditions
let isProcessing = false;
let isShuttingDown = false;
let consecutiveDbErrors = 0;
const MAX_DB_ERRORS = 5;

// 🔧 CHANGE 2: Database health monitoring
let lastDbHealthCheck = Date.now();
const DB_HEALTH_CHECK_INTERVAL = 60000; // 1 minute

// 🔧 CHANGE 3: Safe database operation wrapper
async function safeDbOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  try {
    // Check if we need a health check
    if (Date.now() - lastDbHealthCheck > DB_HEALTH_CHECK_INTERVAL) {
      await checkDatabaseHealth();
    }

    const result = await operation();
    consecutiveDbErrors = 0; // Reset on success
    return result;
  } catch (error: any) {
    consecutiveDbErrors++;
    console.error(
      `❌ Database operation '${operationName}' failed (error #${consecutiveDbErrors}):`,
      error?.message
    );

    // Check if it's a connection-related error
    if (isDatabaseConnectionError(error)) {
      console.error(
        `🔌 Database connection issue detected in ${operationName}`
      );
      if (consecutiveDbErrors >= MAX_DB_ERRORS) {
        console.error(
          `💀 Too many database errors (${MAX_DB_ERRORS}), triggering reconnection`
        );
        await handleDatabaseReconnection();
      }
      throw error; // Rethrow connection errors to trigger higher-level handling
    }

    // For non-connection errors, log and return null
    console.error(
      `⚠️ Non-critical database error in ${operationName}, continuing...`
    );
    return null;
  }
}

// 🔧 CHANGE 4: Database connection error detection
function isDatabaseConnectionError(error: any): boolean {
  const connectionErrorMessages = [
    "Response from the Engine was empty", // Your exact error
    "Connection terminated unexpectedly",
    "Connection lost",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "P1001", // Prisma connection error code
    "P1017", // Server has closed the connection
  ];

  const errorMessage = error?.message || error?.code || "";
  return connectionErrorMessages.some((msg) => errorMessage.includes(msg));
}

// 🔧 CHANGE 5: Database health check function
async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 as health_check`;
    lastDbHealthCheck = Date.now();
    console.log("✅ Database health check passed");
    return true;
  } catch (error) {
    console.error("❌ Database health check failed:", error);
    return false;
  }
}

// 🔧 CHANGE 6: Database reconnection handler
async function handleDatabaseReconnection(): Promise<void> {
  try {
    console.log("🔄 Attempting database reconnection...");

    // Disconnect existing connection
    await prisma.$disconnect();

    // Wait before reconnecting
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Test new connection
    await prisma.$connect();
    await checkDatabaseHealth();

    consecutiveDbErrors = 0;
    console.log("✅ Database reconnection successful");
  } catch (error) {
    console.error("❌ Database reconnection failed:", error);
    throw error;
  }
}

// Main function - processes all pending charges through the state machine
export async function processPendingCharges() {
  // 🔧 CHANGE 7: Enhanced processing guard with shutdown check
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

    // Process different statuses separately to ensure proper order
    await processNewPayments(); // PENDING → CONFIRMED
    await processPayoutInitiated(); // CONFIRMED → PAYOUT_INITIATED
    await processPayoutConfirmed(); // PAYOUT_INITIATED → PAYOUT_CONFIRMED → COMPLETED
  } catch (error) {
    console.error("Error in processPendingCharges:", error);

    // 🔧 CHANGE 8: Handle database connection errors specifically
    if (isDatabaseConnectionError(error)) {
      console.error(
        "Database connection error in main processor, will retry with backoff"
      );
      throw error; // Let the caller handle the backoff
    }
  } finally {
    isProcessing = false;

    // 🔧 CHANGE 9: REMOVED automatic $disconnect() - this was causing your crashes!
    // The old code disconnected on every run, which exhausted connections
    // Instead, we'll let Prisma manage the connection pool
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

  // 🔧 CHANGE 10: Process sequentially to avoid overwhelming database
  for (const charge of pendingCharges) {
    if (isShuttingDown) break;

    try {
      const paid = await hasRequiredSbtcBalance(charge.address, charge.amount);
      if (paid) {
        // Use database transaction to ensure atomicity
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

              return updated;
            }),
          `processNewPayments:update:${charge.chargeId}`
        );

        if (updated) {
          console.log(`💰 Charge ${charge.chargeId} payment confirmed`);
          try {
            await publishChargeUpdate(charge.chargeId);
          } catch (e) {
            console.error("Emit/public update failed for", charge.chargeId, e);
          }
        }
      }

      // 🔧 CHANGE 11: Add small delay between charges to prevent overwhelming
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

      // 2) Do the network call OUTSIDE any transaction
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
      console.log("TX id form transferSbtc", txid);
      // 3) Persist txid
      const updated = await safeDbOperation(
        () =>
          prisma.charge.update({
            where: { id: charge.id },
            data: { payoutTxId: txid, lastProcessedAt: new Date() },
          }),
        `processPayoutInitiated:updateTxId:${charge.chargeId}`
      );

      if (updated) {
        try {
          await publishChargeUpdate(charge.chargeId);
        } catch (e) {
          console.error("Emit/public update failed for", charge.chargeId, e);
        }

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

      const txStatus = await checkTxStatus(charge.payoutTxId);

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

        if (updatedCharge) {
          await publishChargeUpdate(updatedCharge.chargeId);
          console.log(`✅ SBTC payout confirmed for charge ${charge.chargeId}`);

          // Handle webhook delivery
          const hasWebhook =
            !!updatedCharge.merchant?.webhookUrl &&
            !!updatedCharge.merchant?.webhookSecret;

          if (hasWebhook && updatedCharge.isManual) {
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

      // Add delay between transaction checks
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      console.error(
        `❌ Error checking payout confirmation for charge ${charge.chargeId}:`,
        error
      );
      // Don't mark as failed immediately for connection errors
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

// Helper function to mark charges as failed
async function markChargeFailed(chargeId: string, reason: string) {
  await safeDbOperation(
    () =>
      prisma.charge.update({
        where: { chargeId },
        data: {
          status: "FAILED",
          failureReason: reason,
          lastProcessedAt: new Date(),
        },
      }),
    `markChargeFailed:${chargeId}`
  );
  console.error(`💀 Marked charge ${chargeId} as FAILED: ${reason}`);
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
        timeout: 10000,
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

      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return false;
}

// Recovery function to handle stuck transactions
export async function recoverStuckCharges() {
  const stuckCharges = await safeDbOperation(
    () =>
      prisma.charge.findMany({
        where: {
          status: "PAYOUT_INITIATED",
          lastProcessedAt: {
            lt: new Date(Date.now() - 30 * 60 * 1000),
          },
        },
      }),
    "recoverStuckCharges:findMany"
  );

  if (!stuckCharges) return;

  console.log(`🔧 Found ${stuckCharges.length} potentially stuck charges`);

  for (const charge of stuckCharges) {
    if (isShuttingDown) break;

    console.log(`🔧 Checking stuck charge ${charge.chargeId}`);

    if (charge.payoutTxId) {
      const txStatus = await checkTxStatus(charge.payoutTxId);

      if (txStatus.isFailed) {
        await markChargeFailed(
          charge.chargeId,
          `Recovery: Transaction failed - ${txStatus.failureReason}`
        );
      } else if (txStatus.isSuccess) {
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
          `recoverStuckCharges:recover:${charge.chargeId}`
        );
        console.log(
          `🔧 Recovered stuck charge ${charge.chargeId} - transaction was actually successful`
        );
      }
    } else {
      await markChargeFailed(
        charge.chargeId,
        "Recovery: Missing transaction ID after 30 minutes"
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function expireOldCharges() {
  const expired = await safeDbOperation(
    () =>
      prisma.charge.updateMany({
        where: {
          status: "PENDING",
          expiresAt: { lte: new Date() },
        },
        data: { status: "EXPIRED" },
      }),
    "expireOldCharges"
  );

  if (expired && expired.count > 0) {
    console.log(`⏳ Marked ${expired.count} charges as EXPIRED`);
  }
}

// 🔧 CHANGE 12: Completely rewritten poller with proper error handling
export function startChargeProcessor() {
  let consecutiveFailures = 0;
  let pollerTimeout: NodeJS.Timeout | null = null;
  const maxFailures = 5;

  // Graceful shutdown handler
  const gracefulShutdown = async () => {
    console.log("🛑 Shutting down charge processor gracefully...");
    isShuttingDown = true;

    if (pollerTimeout) {
      clearTimeout(pollerTimeout);
    }

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
      consecutiveFailures = 0; // Reset on success
      console.log(`✅ Processing cycle completed successfully`);
    } catch (error: any) {
      consecutiveFailures++;
      console.error(
        `💥 Poller error (failure #${consecutiveFailures}):`,
        error?.message
      );

      // Handle database connection errors specifically
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
    const baseInterval = 30000; // 30 seconds base
    const backoffMultiplier = Math.min(consecutiveFailures, 4); // Cap at 4x
    const nextInterval = baseInterval * Math.pow(1.5, backoffMultiplier); // Gentler backoff

    console.log(`⏰ Next poll in ${Math.round(nextInterval / 1000)} seconds`);
    pollerTimeout = setTimeout(pollWithRetry, nextInterval);
  }

  // Initial health check before starting
  console.log("🚀 Starting charge processor...");
  checkDatabaseHealth()
    .then((healthy) => {
      if (healthy) {
        console.log("✅ Initial database health check passed, starting poller");
        pollWithRetry();
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
