import { safeDbOperation } from "../dbChecker/dbChecker";
import prisma from "../../db";

export async function markChargeFailed(chargeId: string, reason: string) {
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
