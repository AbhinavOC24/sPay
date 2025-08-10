/**
 * Sign with the temp wallet key and pass the SAME temp address as `sender`.
 */
export declare function transferSbtc(senderKey: string, // temp wallet private key (saved on charge)
senderAddress: string, // temp wallet ST... address (saved on charge)
recipientAddress: string, // merchant payout ST... address (testnet)
amountMicroSBTC: bigint): Promise<import("@stacks/transactions").TxBroadcastResult>;
//# sourceMappingURL=transferSbtc.d.ts.map