import prisma from "../../../db";
import { deriveHotWallet } from "../../blockchain/deriveHotWallet";
import { transferAllStx } from "../../blockchain/transferStx";
// mark old pending charges as expired + refund gas fees

export async function expireOldCharges() {
  const expiredCharges = await prisma.charge.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    select: {
      chargeId: true,
      privKey: true,
    },
  });

  if (!expiredCharges.length) return;

  // mark them as expired
  const expired = await prisma.charge.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  console.log(`⏳ Marked ${expired.count} charges as EXPIRED`);

  // refund fee buffers
  try {
    const { stxAddress: hotAddr } = await deriveHotWallet(
      process.env.mnemonicString as string
    );

    for (const c of expiredCharges) {
      try {
        console.log(`♻️ Refunding fee buffer for expired charge ${c.chargeId}`);
        await transferAllStx(c.privKey as string, hotAddr);
      } catch (err) {
        console.error(`⚠️ Failed refund for ${c.chargeId}:`, err);
      }
    }
  } catch (err) {
    console.error("⚠️ Failed hot wallet derivation in expireOldCharges:", err);
  }
}
