import prisma from "../../db";
import {
  safeDbOperation,
  isDatabaseConnectionError,
  checkDatabaseHealth,
  handleDatabaseReconnection,
} from "../dbChecker/dbChecker";

import { expireOldCharges } from "./chargeProcessorComponents/expireOldCharges";
import { processNewPayments } from "./chargeProcessorComponents/processNewPayments";
import { processPayoutInitiated } from "./chargeProcessorComponents/processPayoutInitiated";
import { processPayoutConfirmed } from "./chargeProcessorComponents/processPayoutConfirmed";
import { recoverStuckCharges } from "./chargeProcessorComponents/recoverStuckCharges";
import { retryFailedWebhooks } from "./chargeProcessorComponents/retryFailedWebhooks";
// flags to prevent race conditions
let isProcessing = false;
let isShuttingDown = false;

// - 🔄 **State machine** – moves charges through their lifecycle:
//   - PENDING → CONFIRMED (payment detected)
//   - CONFIRMED → PAYOUT_INITIATED (payout tx broadcast)
//   - PAYOUT_INITIATED → PAYOUT_CONFIRMED (tx confirmed on-chain)
//   - PAYOUT_CONFIRMED → COMPLETED (webhook delivered + finalized)
export function startChargeProcessor() {
  let consecutiveFailures = 0;
  let pollerTimeout: NodeJS.Timeout | null = null;
  let recoveryTimer: ReturnType<typeof setInterval> | null = null;

  const maxFailures = 5;

  // Graceful shutdown handler
  const gracefulShutdown = async () => {
    console.log("Shutting down charge processor gracefully...");
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
      console.log("Database disconnected cleanly");
    } catch (e) {
      console.warn(" Error during database disconnect:", e);
    }

    console.log(" Charge processor shut down complete");
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  async function pollWithRetry() {
    if (isShuttingDown) return;

    try {
      await processPendingCharges();
      consecutiveFailures = 0;
      console.log(` Processing cycle completed successfully`);
    } catch (error: any) {
      consecutiveFailures++;
      console.error(
        `💥 Poller error (failure #${consecutiveFailures}):`,
        error?.message
      );

      if (isDatabaseConnectionError(error)) {
        console.log(
          " Database connection error detected, attempting recovery..."
        );
        try {
          await handleDatabaseReconnection();
          console.log("Database reconnection successful, continuing...");
        } catch (reconnectError) {
          console.error(" Database reconnection failed:", reconnectError);
          if (consecutiveFailures >= maxFailures) {
            console.error("Too many failures, shutting down...");
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

    console.log(`Next poll in ${Math.round(nextInterval / 1000)} seconds`);
    pollerTimeout = setTimeout(pollWithRetry, nextInterval);
  }

  // Initial health checks
  console.log("Starting charge processor...");
  checkDatabaseHealth()
    .then((healthy) => {
      if (healthy) {
        console.log("Initial database health check passed, starting poller");
        pollWithRetry();
        // Start recovery timer (every 30 min by default)
        const RECOVERY_INTERVAL_MS = Number(
          process.env.RECOVERY_INTERVAL_MS || 30 * 60 * 1000
        );
        recoveryTimer = setInterval(async () => {
          if (!isProcessing && !isShuttingDown) {
            try {
              await recoverStuckCharges(isShuttingDown);
            } catch (err) {
              console.error("❌ Recovery cycle failed:", err);
            }
          } else {
            console.log("Skipping recovery (processor busy or shutting down)");
          }
        }, RECOVERY_INTERVAL_MS);

        // Retry webhooks every 1 minute
        setInterval(() => {
          if (!isProcessing && !isShuttingDown) {
            retryFailedWebhooks(isShuttingDown).catch((err) =>
              console.error("❌ Webhook retry failed:", err)
            );
          }
        }, 60_000);
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

    // Step 1: Check for new payments and mark as confirmed
    await processNewPayments(isShuttingDown); // PENDING → CONFIRMED

    // Step 2: Process confirmed charges and initiate payouts
    await processPayoutInitiated(isShuttingDown); // CONFIRMED → PAYOUT_INITIATED

    await processPayoutConfirmed(isShuttingDown); // PAYOUT_INITIATED → PAYOUT_CONFIRMED → COMPLETED
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
