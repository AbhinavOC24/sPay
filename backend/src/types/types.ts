// The payload merchants receive when a charge is confirmed
interface ChargeConfirmedPayload {
  chargeId: string; // Unique charge identifier in your system
  address: string; // STX address that received payment
  amount: string; // Amount in micro-units (string for BigInt safety)
  paidAt?: string | undefined; // ISO timestamp when payment was confirmed
  payoutTxId: string | null; // ✅ Added this field
}

// Merchant's webhook configuration stored in your system
interface MerchantWebhookConfig {
  url: string | null;
  secret: string | null;
}

// Parameters needed to send a webhook
export interface WebhookDeliveryParams {
  payload: ChargeConfirmedPayload;
  config: MerchantWebhookConfig;
}
export type InternalStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PAYOUT_INITIATED"
  | "PAYOUT_CONFIRMED"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED";

export type PublicStatus =
  | "PENDING"
  | "CONFIRMED"
  | "UNDERPAID"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"; // optional to surface

export function toPublicStatus(s: InternalStatus): PublicStatus {
  switch (s) {
    case "PENDING":
    case "PAYOUT_INITIATED":
    case "PAYOUT_CONFIRMED":
      return "PENDING";
    case "COMPLETED":
    case "CONFIRMED":
      return "CONFIRMED"; // after funds hit you, it’s “paid” to the shopper
    case "EXPIRED":
      return "EXPIRED";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
  }
}

// Event we stream to the checkout (SSE)
export interface ChargeEventPublic {
  chargeId: string;
  address: string;
  amount: string | number; // base units
  status: PublicStatus;
  txid?: string | null;

  expiresAt?: string; // ISO
  remainingSec?: number; // for countdown
}
