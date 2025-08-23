import {
  makeSTXTokenTransfer,
  broadcastTransaction,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import axios from "axios";

const network = STACKS_TESTNET;

export async function transferStx(
  senderKey: string,
  recipient: string,
  amountMicroStx: bigint
) {
  try {
    // 1. Get fee rate
    const feeRateRes = await axios.get(
      "https://api.testnet.hiro.so/v2/fees/transfer"
    );
    const feeRate = Number(feeRateRes.data) || 1;

    // estimate ~180 bytes
    const estimatedFee = BigInt(Math.ceil(feeRate * 180 * 1.2));

    // 2. Build tx
    const tx = await makeSTXTokenTransfer({
      recipient,
      amount: amountMicroStx,
      senderKey,
      network,
      fee: estimatedFee,
    });

    // 3. Broadcast
    const result = await broadcastTransaction({ transaction: tx, network });
    console.log("📡 STX transfer broadcast result:", result);

    if ("error" in result) {
      throw new Error(
        `STX transfer failed: ${result.error} (${
          result.reason || "unknown reason"
        })`
      );
    }

    // ✅ result only has txid here
    return { txid: result.txid };
  } catch (err: any) {
    console.error("❌ transferStx failed:", err.message);
    throw err;
  }
}
