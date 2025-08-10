export declare function checkTxStatus(txid: string): Promise<{
    status: any;
    isSuccess: boolean;
    isFailed: any;
    isPending: boolean;
    txData: any;
    failureReason: any;
}>;
export declare function waitForTxSuccess(txid: string, timeoutMs?: number): Promise<any>;
//# sourceMappingURL=txChecker.d.ts.map