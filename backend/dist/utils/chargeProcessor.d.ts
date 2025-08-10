export declare function processPendingCharges(): Promise<void>;
export declare function retryFailedWebhooks(): Promise<void>;
export declare function hasRequiredSbtcBalance(address: string, requiredAmount: bigint): Promise<boolean>;
export declare function recoverStuckCharges(): Promise<void>;
export declare function startChargeProcessor(): void;
//# sourceMappingURL=chargeProcessor.d.ts.map