import axios from "axios";
const HIRO_API_BASE = "https://api.testnet.hiro.so";

function normalizeTxId(txId: string) {
  return txId.startsWith("0x") ? txId.slice(2) : txId;
}

export async function checkTxStatus(txid: string, maxAttempts = 5) {
  const clean = normalizeTxId(txid);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `${HIRO_API_BASE}/extended/v1/tx/${clean}`,
        { timeout: 10000, validateStatus: () => true }
      );

      if (response.status === 200) {
        const txData = response.data;

        return {
          status: txData.tx_status,
          isSuccess: txData.tx_status === "success",
          isFailed:
            txData.tx_status?.startsWith("abort") ||
            txData.tx_status === "failed",
          isPending: !["success", "failed"].some(
            (s) =>
              txData.tx_status === s || txData.tx_status?.startsWith("abort")
          ),
          txData,
          failureReason: txData.tx_result?.repr || txData.tx_status,
        };
      }

      if (response.status === 404) {
        await new Promise((r) => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s…
        continue;
      }

      throw new Error(`Unexpected status ${response.status}`);
    } catch (error: any) {
      console.error(
        `❌ Error checking tx status for ${clean} (attempt ${attempt}/${maxAttempts}):`,
        error.message
      );
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  // Fallback: if still no result, treat as pending
  return {
    status: "unknown",
    isSuccess: false,
    isFailed: false,
    isPending: true,
    txData: null,
    failureReason: `Tx ${clean} not found after ${maxAttempts} attempts`,
  };
}
