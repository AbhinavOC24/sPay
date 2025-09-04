import prisma from "../../db"; // matches your import style
import { eventBus, chargeTopic } from "../eventBus";
import toChargeEvent from "./publicPayloadBuilder";

export async function publishChargeUpdate(chargeId: string) {
  const row = await prisma.charge.findUnique({
    where: { chargeId },
    select: {
      chargeId: true,
      address: true,
      amount: true,
      status: true,
      success_url: true,
      cancel_url: true,
      payoutTxId: true,
      usdRate: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  if (!row) return null;

  const payload = toChargeEvent(row);

  eventBus.emit(chargeTopic(chargeId), payload); // ← notify SSE listeners
  return payload;
}
