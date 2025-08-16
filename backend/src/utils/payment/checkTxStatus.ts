import axios from "axios";
const HIRO_API_BASE = "https://api.testnet.hiro.so";

// export async function waitForTxSuccess(txid: string, timeoutMs = 60_000) {
//   const end = Date.now() + timeoutMs;
//   while (Date.now() < end) {
//     const r = await axios
//       .get(`${HIRO_API_BASE}/extended/v1/tx/${txid}`)
//       .then((x) => x.data);
//     if (r.tx_status === "success") return r;
//     if (r.tx_status?.startsWith("abort") || r.tx_status === "failed") {
//       const reason = r.tx_result?.repr ?? r.tx_status;
//       throw new Error(`payout failed: ${reason}`);
//     }
//     await new Promise((res) => setTimeout(res, 3000));
//   }
//   throw new Error("payout pending timeout");
// }

// ✅ Non-blocking version for state machine

function normalizeTxId(txId: string) {
  return txId.startsWith("0x") ? txId.slice(2) : txId;
}
export async function checkTxStatus(txid: string) {
  try {
    const clean = normalizeTxId(txid);

    const response = await axios.get(
      `${HIRO_API_BASE}/extended/v1/tx/${clean}`,
      { timeout: 10000 } // 10 second timeout
    );

    const txData = response.data;

    console.log(`TX ${clean} status: ${txData.tx_status}`);

    return {
      status: txData.tx_status,
      isSuccess: txData.tx_status === "success",
      isFailed:
        txData.tx_status?.startsWith("abort") || txData.tx_status === "failed",
      isPending: !["success", "failed"].some(
        (s) => txData.tx_status === s || txData.tx_status?.startsWith("abort")
      ),
      txData: txData,
      failureReason: txData.tx_result?.repr || txData.tx_status,
    };
  } catch (error) {
    console.error(`Error checking tx status for ${txid}:`, error);
    // Return unknown status if API call fails
    return {
      status: "unknown",
      isSuccess: false,
      isFailed: false,
      isPending: true, // Assume pending if we can't check
      txData: null,
      failureReason: `API error: ${error}`,
    };
  }
}

// ✅ Original blocking version - keep for other use cases
// export async function waitForTxSuccess(txid: string, timeoutMs = 60_000) {
//   const end = Date.now() + timeoutMs;

//   while (Date.now() < end) {
//     const result = await checkTxStatus(txid);

//     if (result.isSuccess) {
//       console.log(`✅ TX ${txid} succeeded`);
//       return result.txData;
//     }

//     if (result.isFailed) {
//       console.log(`❌ TX ${txid} failed: ${result.failureReason}`);
//       throw new Error(`Transaction failed: ${result.failureReason}`);
//     }

//     if (result.status === "unknown") {
//       console.log(`⚠️ TX ${txid} status unknown, retrying...`);
//     } else {
//       console.log(`⏳ TX ${txid} still pending...`);
//     }

//     await new Promise((res) => setTimeout(res, 3000));
//   }

//   throw new Error(`Transaction timeout after ${timeoutMs}ms`);
// }
