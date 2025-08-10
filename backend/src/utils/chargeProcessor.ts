import { prisma } from "./prisma-client";
import axios from "axios";

import { deliverChargeConfirmedWebhook } from "./deliverChargeWebhook";
import { transferSbtc } from "./transferSbtc";
import { waitForTxSuccess } from "./txChecker";

const HIRO_API_BASE = "https://api.testnet.hiro.so";
const merchant_addr = "something";
// Poll for charges that are pending and confirm them if payment is detected
export async function processPendingCharges() {
  const pendingCharges = await prisma.charge.findMany({
    where: { status: "PENDING" },
    include: { merchant: true },
  });

  for (const charge of pendingCharges) {
    const paid = await hasRequiredSbtcBalance(charge.address, charge.amount);
    if (paid) {
      // 1) Mark confirmed

      const updated = await prisma.charge.update({
        where: { id: charge.id },
        data: { status: "CONFIRMED", paidAt: new Date() },
        include: { merchant: true }, // keep merchant on the updated record too
      });
      console.log(`Charge ${charge.chargeId} confirmed`);
      if (!updated.privKey) {
        console.error(
          `Charge ${updated.chargeId}: missing temp wallet privKey; skipping payout`
        );
      } else if (!updated.merchant?.payoutStxAddress) {
        console.error(
          `Charge ${updated.chargeId}: merchant payoutStxAddress missing; skipping payout`
        );
      } else {
        const tempAddrPrivKey = updated.privKey;
        const tempAddr = updated.address;
        const merchantPayoutAddr = updated.merchant.payoutStxAddress;
        const amt = updated.amount;
        try {
          const { txid } = await transferSbtc(
            tempAddrPrivKey, // signer key = temp wallet key
            tempAddr, // sender = the SAME temp wallet address
            merchantPayoutAddr, // recipient = merchant payout
            amt
          );
          console.log("SBTC payout broadcast:", txid);

          const final = await waitForTxSuccess(txid);
          console.log("SBTC payout CONFIRMED:", txid);
        } catch (e: any) {
          console.error("SBTC payout FAILED:", e?.message || e);
        }
      }
      const hasWebhook =
        !!updated.merchant?.webhookUrl && !!updated.merchant?.webhookSecret;

      if (hasWebhook && updated.webhookLastStatus !== "SUCCESS") {
        await deliverChargeConfirmedWebhook({
          payload: {
            chargeId: updated.chargeId,
            address: updated.address,
            amount: String(updated.amount),
            paidAt: updated.paidAt?.toISOString(),
          },
          config: {
            url: updated.merchant.webhookUrl,
            secret: updated.merchant.webhookSecret,
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
