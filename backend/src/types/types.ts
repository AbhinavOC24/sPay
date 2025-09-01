interface ChargeConfirmedPayload {
  chargeId: string;
  address: string;
  amount: string;
  paidAt?: string | undefined;
  payoutTxId: string | null;
}

interface MerchantWebhookConfig {
  url: string | null;
  secret: string | null;
}

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
  | "FAILED";

export function toPublicStatus(s: InternalStatus): PublicStatus {
  switch (s) {
    case "PENDING":
    case "CONFIRMED":
    case "PAYOUT_INITIATED":
      return "PENDING";
    case "PAYOUT_CONFIRMED":
    case "COMPLETED":
      return "CONFIRMED";
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
  amount: string | number;
  status: PublicStatus;
  txid?: string | null;

  expiresAt?: string;
  remainingSec?: number;
}
