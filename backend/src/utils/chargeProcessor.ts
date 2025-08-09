import { prisma } from "./prisma-client";
import axios from "axios";

import { deliverChargeConfirmedWebhook } from "./deliverChargeWebhook";
import { transferSbtc } from "./sbtcTransfer";

const HIRO_API_BASE = "https://api.testnet.hiro.so";
const merchant_addr = "something";
// Poll for charges that are pending and confirm them if payment is detected
export async function processPendingCharges() {
  const pendingCharges = await prisma.charge.findMany({
    where: { status: "PENDING" },
  });

  for (const charge of pendingCharges) {
    const paid = await hasRequiredSbtcBalance(charge.address, charge.amount);
    if (paid) {
      const updated = await prisma.charge.update({
        where: { id: charge.id },
        data: { status: "CONFIRMED", paidAt: new Date() },
      });
      console.log(`Charge ${charge.chargeId} confirmed`);
      if (!updated.privKey) return;
      const result = await transferSbtc(
        updated.privKey,
        updated.address,
        merchant_addr,
        updated.amount
      );
      console.log(result);
      if (
        updated.webhookUrl &&
        updated.webhookSecret &&
        updated.webhookLastStatus !== "SUCCESS"
      ) {
        await deliverChargeConfirmedWebhook({
          payload: {
            chargeId: updated.chargeId,
            address: updated.address,
            amount: String(updated.amount),
            paidAt: updated.paidAt?.toISOString(),
          },
          config: {
            url: updated.webhookUrl,
            secret: updated.webhookSecret,
          },
        });
      }
    }
  }
}

// Check if an address has enough SBTC balance
export async function hasRequiredSbtcBalance(
  address: string,
  requiredAmount: bigint
) {
  try {
    const url = `${HIRO_API_BASE}/extended/v1/address/${address}/balances`;
    const { data } = await axios.get(url);
    const sbtcKey = Object.keys(data.fungible_tokens).find((key) =>
      key.includes("sbtc")
    );
    if (!sbtcKey) return false;
    const balance = BigInt(data.fungible_tokens[sbtcKey].balance || "0");
    return balance >= requiredAmount;
  } catch (error) {
    console.error(error);
  }
}
