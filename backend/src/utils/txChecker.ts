import axios from "axios";
const HIRO_API_BASE = "https://api.testnet.hiro.so";

export async function waitForTxSuccess(txid: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await axios
      .get(`${HIRO_API_BASE}/extended/v1/tx/${txid}`)
      .then((x) => x.data);
    if (r.tx_status === "success") return r;
    if (r.tx_status?.startsWith("abort") || r.tx_status === "failed") {
      const reason = r.tx_result?.repr ?? r.tx_status;
      throw new Error(`payout failed: ${reason}`);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("payout pending timeout");
}
