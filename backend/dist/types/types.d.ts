interface ChargeConfirmedPayload {
    chargeId: string;
    address: string;
    amount: string;
    paidAt?: string | undefined;
}
interface MerchantWebhookConfig {
    url: string;
    secret: string;
}
export interface WebhookDeliveryParams {
    payload: ChargeConfirmedPayload;
    config: MerchantWebhookConfig;
}
export {};
//# sourceMappingURL=types.d.ts.map