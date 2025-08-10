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
export {};
//# sourceMappingURL=types.d.ts.map