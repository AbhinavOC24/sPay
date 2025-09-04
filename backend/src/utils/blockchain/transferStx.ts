import {
  makeSTXTokenTransfer,
  broadcastTransaction,
  getAddressFromPrivateKey,
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
    const feeRateRes = await axios.get(
      "https://api.testnet.hiro.so/v2/fees/transfer"
    );
    const feeRate = Number(feeRateRes.data) || 1;

    const estimatedFee = BigInt(Math.ceil(feeRate * 180 * 1.2));

    const tx = await makeSTXTokenTransfer({
      recipient,
      amount: amountMicroStx,
      senderKey,
      network,
      fee: estimatedFee,
    });

    const result = await broadcastTransaction({ transaction: tx, network });

    if ("error" in result) {
      throw new Error(
        `STX transfer failed: ${result.error} (${
          result.reason || "unknown reason"
        })`
      );
    }

    return { txid: result.txid };
  } catch (err: any) {
    console.error("❌ transferStx failed:", err.message);
    throw err;
  }
}

export async function transferAllStx(senderKey: string, recipient: string) {
  try {
    // ✅ derive address from privKey
    const senderAddr = getAddressFromPrivateKey(senderKey, network);

    // get balance
    const balRes = await axios.get(
      `https://api.testnet.hiro.so/extended/v1/address/${senderAddr}/balances`
    );
    const balance = BigInt(balRes.data.stx.balance);

    if (balance === 0n) throw new Error("No STX to sweep from temp wallet");

    // estimate fee
    const feeRateRes = await axios.get(
      "https://api.testnet.hiro.so/v2/fees/transfer"
    );
    const feeRate = Number(feeRateRes.data) || 1;
    const estimatedFee = BigInt(Math.ceil(feeRate * 180 * 1.2));

    const sendable = balance > estimatedFee ? balance - estimatedFee : 0n;
    if (sendable <= 0n) {
      throw new Error("Insufficient balance after fee");
    }

    // sign & send using privKey
    const tx = await makeSTXTokenTransfer({
      recipient,
      amount: sendable,
      senderKey, // ✅ private key, not address
      network,
      fee: estimatedFee,
    });

    const result = await broadcastTransaction({ transaction: tx, network });
    if ("error" in result) {
      throw new Error(
        `STX transfer failed: ${result.error} (${
          result.reason || "unknown reason"
        })`
      );
    }

    return { txid: result.txid };
  } catch (err: any) {
    console.error("❌ transferAllStx failed:", err.message);
    throw err;
  }
}
