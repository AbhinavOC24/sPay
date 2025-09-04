const HIRO_API_BASE = "https://api.testnet.hiro.so";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000;
import axios from "axios";
// Check if an ephemeral address has enough SBTC balance with retry logic
export async function hasRequiredSbtcBalance(
  address: string,
  requiredAmount: bigint
) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${HIRO_API_BASE}/extended/v1/address/${address}/balances`;
      const { data } = await axios.get(url, {
        timeout: 10000,
      });

      const sbtcKey = Object.keys(data.fungible_tokens || {}).find((key) =>
        key.includes("sbtc")
      );

      if (!sbtcKey) return false;

      const balance = BigInt(data.fungible_tokens[sbtcKey].balance || "0");
      const hasEnough = balance >= requiredAmount;

      return hasEnough;
    } catch (error: any) {
      console.error(
        `❌ Attempt ${attempt} failed for balance check of ${address}:`,
        error?.message
      );

      if (attempt === MAX_RETRIES) {
        console.error(
          `❌ Failed to check balance after ${MAX_RETRIES} attempts`
        );
        return false;
      }

      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return false;
} //not used

// Fetch latest sBTC payment into ephemeral address
export async function getIncomingSbtcPayment(
  address: string,
  requiredAmount: bigint
) {
  const url = `${HIRO_API_BASE}/extended/v1/address/${address}/transactions_with_transfers?limit=10`;
  const { data } = await axios.get(url, { timeout: 10000 });

  for (const tx of data.results) {
    // Look for fungible token transfers involving sbtc
    const transfers = tx.ft_transfers || [];
    for (const tr of transfers) {
      if (
        tr.asset_identifier.includes("sbtc-token") &&
        tr.recipient === address
      ) {
        const amount = BigInt(tr.amount);
        if (amount >= requiredAmount) {
          return {
            txid: tx.tx_id,
            payer: tr.sender, // this is the Stacks address of the payer
            amount,
          };
        }
      }
    }
  }

  return null;
}
