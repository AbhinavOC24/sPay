// utils/transferStx.ts
import {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

export async function transferStx(
  senderKey: string,
  recipient: string,
  amountMicroStx: bigint
) {
  const tx = await makeSTXTokenTransfer({
    recipient,
    amount: amountMicroStx, // e.g., 100_000n for 0.1 STX
    senderKey,
    network: STACKS_TESTNET,
  });
  const res = await broadcastTransaction({
    transaction: tx,
    network: STACKS_TESTNET,
  });
  return res; // txid or error
}
