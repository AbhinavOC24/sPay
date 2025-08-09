// The payload merchants receive when a charge is confirmed
interface ChargeConfirmedPayload {
  chargeId: string; // Unique charge identifier in your system
  address: string; // STX address that received payment
  amount: string; // Amount in micro-units (string for BigInt safety)
  paidAt?: string | undefined; // ISO timestamp when payment was confirmed
}

// Merchant's webhook configuration stored in your system
interface MerchantWebhookConfig {
  url: string;
  secret: string;
}

// Parameters needed to send a webhook
export interface WebhookDeliveryParams {
  payload: ChargeConfirmedPayload;
  config: MerchantWebhookConfig;
}
