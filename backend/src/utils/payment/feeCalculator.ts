// utils/simpleFeeCalculator.ts
import axios from "axios";

// Get current network fees from Hiro API
export async function getCurrentNetworkFees() {
  try {
    const response = await axios.get(
      "https://api.testnet.hiro.so/v2/fees/transfer"
    );

    // The API returns fee rates per byte
    const fees = {
      low: response.data.low || 1, // Slow but cheap
      medium: response.data.medium || 5, // Normal speed
      high: response.data.high || 10, // Fast but expensive
    };

    console.log("📊 Current network fees:", fees);
    return fees;
  } catch (error) {
    console.log("⚠️ Couldn't get network fees, using defaults");
    // Safe fallback values
    return { low: 1, medium: 5, high: 10 };
  }
}

// Calculate how much STX we need for fees
export async function calculateFeeBuffer() {
  const networkFees = await getCurrentNetworkFees();

  // A typical STX transaction is about 400 bytes
  const transactionSize = 400;

  // Use medium priority (good balance of speed vs cost)
  const feePerByte = networkFees.medium;

  // Calculate: fee per byte × transaction size
  const estimatedFee = feePerByte * transactionSize;

  // Add 20% safety buffer and convert to microSTX
  const feeBufferMicroSTX = BigInt(Math.ceil(estimatedFee * 1.2));

  console.log(`💰 Calculated fee buffer: ${feeBufferMicroSTX} microSTX`);

  return feeBufferMicroSTX;
}
