import axios from "axios";

export async function getCurrentNetworkFees() {
  try {
    const response = await axios.get(
      "https://api.testnet.hiro.so/v2/fees/transfer"
    );

    const fees = {
      low: response.data.low || 1, // Slow but cheap
      medium: response.data.medium || 5, // Normal speed
      high: response.data.high || 10, // Fast but expensive
    };

    console.log("📊 Current network fees:", fees);
    return fees;
  } catch (error) {
    console.log("⚠️ Couldn't get network fees, using defaults");

    return { low: 1, medium: 5, high: 10 };
  }
}

export async function calculateFeeBuffer() {
  const networkFees = await getCurrentNetworkFees();

  // Average tx about 400 bytes
  const transactionSize = 400;

  const feePerByte = networkFees.medium;

  const estimatedFee = feePerByte * transactionSize;

  const feeBufferMicroSTX = BigInt(Math.ceil(estimatedFee * 1.2));

  console.log(`💰 Calculated fee buffer: ${feeBufferMicroSTX} microSTX`);

  return feeBufferMicroSTX;
}
