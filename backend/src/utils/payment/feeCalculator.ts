// import axios from "axios";

// export async function getCurrentNetworkFees() {
//   try {
//     const response = await axios.get(
//       "https://api.testnet.hiro.so/v2/fees/transfer"
//     );

//     const fees = {
//       low: response.data.low || 1, // Slow but cheap
//       medium: response.data.medium || 5, // Normal speed
//       high: response.data.high || 10, // Fast but expensive
//     };

//     console.log("📊 Current network fees:", fees);
//     return fees;
//   } catch (error) {
//     console.log("⚠️ Couldn't get network fees, using defaults");

//     return { low: 1, medium: 5, high: 10 };
//   }
// }

// export async function calculateFeeBuffer() {
//   const networkFees = await getCurrentNetworkFees();

//   // Average tx about 400 bytes
//   const transactionSize = 400;

//   const feePerByte = networkFees.medium;

//   const estimatedFee = feePerByte * transactionSize;

//   const feeBufferMicroSTX = BigInt(Math.ceil(estimatedFee * 1.2));

//   console.log(`💰 Calculated fee buffer: ${feeBufferMicroSTX} microSTX`);

//   return feeBufferMicroSTX;
// }

// utils/blockchain/feeCalculator.ts
import axios from "axios";

/**
 * Quick buffer for charge creation – assumes ~1000 bytes, double it for safety.
 */
export async function calculateFeeBuffer(): Promise<bigint> {
  try {
    const res = await axios.get("https://api.testnet.hiro.so/v2/fees/transfer");
    const feeRate = Number(res.data); // microSTX per byte
    const assumedSize = 1000; // contract calls ~800–1200 bytes
    const estimated = feeRate * assumedSize;
    const buffer = BigInt(Math.ceil(estimated * 2)); // 2x buffer
    console.log(`💸 Preload buffer: ${buffer} µSTX`);
    return buffer;
  } catch (err) {
    console.error("⚠️ Fee buffer fallback");
    return 10_000n; // ~0.01 STX
  }
}

/**
 * Precise fee estimation for a specific contract-call tx
 */
export async function getContractCallFee(
  payloadHex: string,
  estimatedLen: number
): Promise<bigint> {
  try {
    const res = await axios.post(
      "https://api.testnet.hiro.so/v2/fees/transaction",
      {
        transaction_payload: payloadHex,
        estimated_len: estimatedLen,
      }
    );

    if (!res.data.estimations || res.data.estimations.length === 0) {
      throw new Error("No fee estimates returned");
    }

    const fee = BigInt(res.data.estimations[1].fee); // pick medium
    console.log(`💰 Recommended fee: ${fee} µSTX`);
    return fee;
  } catch (err) {
    console.error("⚠️ Fee estimation failed", err);
    return 10_000n; // fallback
  }
}
