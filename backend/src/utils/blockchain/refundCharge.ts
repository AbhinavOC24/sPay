import prisma from "../../db";
import { safeDbOperation } from "../dbChecker/dbChecker";
import { transferSbtc } from "./transferSbtc";

export async function refundCharge(chargeId: string) {
  try {
    const charge = await safeDbOperation(
      () =>
        prisma.charge.findUnique({
          where: { chargeId },
        }),
      `refundCharge:find:${chargeId}`
    );

    if (!charge) throw new Error(`Charge ${chargeId} not found`);

    if (!charge.privKey)
      throw new Error(`Missing ephemeral privKey for ${chargeId}`);
    if (!charge.payerAddress)
      throw new Error(`No payerAddress stored for ${chargeId}`);
    if (charge.payoutTxId)
      throw new Error(`Charge ${chargeId} already paid out`);

    console.log(
      `💸 Refunding charge ${charge.chargeId} → ${charge.payerAddress}`
    );

    const { txid } = await transferSbtc(
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
          },
        }),
      `refundCharge:update:${charge.chargeId}`
    );

    console.log(`✅ Refund sent for ${charge.chargeId}, txid: ${txid}`);
    return txid;
  } catch (error) {
    console.log("Couldn't refund", error);
  }
}
