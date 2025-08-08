import { prisma } from "./prisma-client";
import axios from "axios";

const HIRO_BASE = "https://api.testnet.hiro.so";

export async function addressHasSbtc(address: string, requiredAmount: bigint) {
  try {
    const url = `${HIRO_BASE}/extended/v1/address/${address}/balances`;
    const { data } = await axios.get(url);
    console.log(data);
    const sbtcKey = Object.keys(data.fungible_tokens).find((key) =>
      key.includes("sbtc")
    );
    if (!sbtcKey) return false;
    const balance = BigInt(data.fungible_tokens[sbtcKey].balance || "0");
    return balance >= requiredAmount;
  } catch (error) {
    console.log(error);
  }
}

export async function pollPendingCharges() {
  const pendingCharges = await prisma.charge.findMany({
    where: { status: "PENDING" },
  });

  for (const charge of pendingCharges) {
    const paid = await addressHasSbtc(charge.address, charge.amount);
    if (paid) {
      await prisma.charge.update({
        where: { id: charge.id },
        data: { status: "CONFIRMED", paidAt: new Date() },
      });
      console.log(`Charge ${charge.chargeId} confirmed`);
    }
  }
}
