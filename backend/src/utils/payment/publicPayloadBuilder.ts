import { toPublicStatus } from "../../types/types";

export default function toChargeEvent(c: any): any {
  const now = new Date();
  const exp = c.expiresAt
    ? new Date(c.expiresAt)
    : new Date(new Date(c.createdAt).getTime() + 15 * 60 * 1000);
  const remainingSec = Math.max(0, Math.floor((+exp - +now) / 1000));

  if (
    remainingSec === 0 &&
    (c.status === "PENDING" || c.status === "DETECTED")
  ) {
    c.status = "EXPIRED";
  }

  return {
    chargeId: c.chargeId,
    address: c.address,
    amount: c.amount,
    status: toPublicStatus(c.status),
    txid: c.txid ?? null,
    expiresAt: exp.toISOString(),
    usdRate: c.usdRate,
    remainingSec,
  };
}
