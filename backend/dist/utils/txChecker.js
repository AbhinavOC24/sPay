"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTxStatus = checkTxStatus;
exports.waitForTxSuccess = waitForTxSuccess;
const axios_1 = __importDefault(require("axios"));
const HIRO_API_BASE = "https://api.testnet.hiro.so";
//Old Version
// export async function waitForTxSuccess(txid: string, timeoutMs = 60_000) {
//   const end = Date.now() + timeoutMs;
//   while (Date.now() < end) {
//     const r = await axios
//       .get(`${HIRO_API_BASE}/extended/v1/tx/${txid}`)
//       .then((x) => x.data);
//     if (r.tx_status === "success") return r;
//     if (r.tx_status?.startsWith("abort") || r.tx_status === "failed") {
//       const reason = r.tx_result?.repr ?? r.tx_status;
//       throw new Error(`payout failed: ${reason}`);
//     }
//     await new Promise((res) => setTimeout(res, 3000));
//   }
//   throw new Error("payout pending timeout");
// }
// ✅ Non-blocking version for state machine
function checkTxStatus(txid) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const response = yield axios_1.default.get(`${HIRO_API_BASE}/extended/v1/tx/${txid}`, { timeout: 10000 } // 10 second timeout
            );
            const txData = response.data;
            console.log(`TX ${txid} status: ${txData.tx_status}`);
            return {
                status: txData.tx_status,
                isSuccess: txData.tx_status === "success",
                isFailed: ((_a = txData.tx_status) === null || _a === void 0 ? void 0 : _a.startsWith("abort")) || txData.tx_status === "failed",
                isPending: !["success", "failed"].some((s) => { var _a; return txData.tx_status === s || ((_a = txData.tx_status) === null || _a === void 0 ? void 0 : _a.startsWith("abort")); }),
                txData: txData,
                failureReason: ((_b = txData.tx_result) === null || _b === void 0 ? void 0 : _b.repr) || txData.tx_status,
            };
        }
        catch (error) {
            console.error(`Error checking tx status for ${txid}:`, error);
            // Return unknown status if API call fails
            return {
                status: "unknown",
                isSuccess: false,
                isFailed: false,
                isPending: true, // Assume pending if we can't check
                txData: null,
                failureReason: `API error: ${error}`,
            };
        }
    });
}
// ✅ Original blocking version - keep for other use cases
function waitForTxSuccess(txid_1) {
    return __awaiter(this, arguments, void 0, function* (txid, timeoutMs = 60000) {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            const result = yield checkTxStatus(txid);
            if (result.isSuccess) {
                console.log(`✅ TX ${txid} succeeded`);
                return result.txData;
            }
            if (result.isFailed) {
                console.log(`❌ TX ${txid} failed: ${result.failureReason}`);
                throw new Error(`Transaction failed: ${result.failureReason}`);
            }
            if (result.status === "unknown") {
                console.log(`⚠️ TX ${txid} status unknown, retrying...`);
            }
            else {
                console.log(`⏳ TX ${txid} still pending...`);
            }
            yield new Promise((res) => setTimeout(res, 3000));
        }
        throw new Error(`Transaction timeout after ${timeoutMs}ms`);
    });
}
//# sourceMappingURL=txChecker.js.map