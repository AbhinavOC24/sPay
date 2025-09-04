//  Database health
let lastDbHealthCheck = Date.now();
const DB_HEALTH_CHECK_INTERVAL = 60000; // 1 minute
let consecutiveDbErrors = 0;
const MAX_DB_ERRORS = 5;
import prisma from "../../db";

export async function safeDbOperation<T>(
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

    // For non-connection errors,return null
    console.error(
      `⚠️ Non-critical database error in ${operationName}, continuing...`
    );
    return null;
  }
}

//  Database connection error detection
export function isDatabaseConnectionError(error: any): boolean {
  const connectionErrorMessages = [
    "Response from the Engine was empty",
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

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 as health_check`;
    lastDbHealthCheck = Date.now();

    return true;
  } catch (error) {
    return false;
  }
}

export async function handleDatabaseReconnection(): Promise<void> {
  try {
    console.log("Attempting database reconnection...");

    await prisma.$disconnect();

    // Wait before reconnecting
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Test new connection
    await prisma.$connect();
    await checkDatabaseHealth();

    consecutiveDbErrors = 0;
    console.log("Database reconnection successful");
  } catch (error) {
    console.error("Database reconnection failed:", error);
    throw error;
  }
}
