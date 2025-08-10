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
exports.waitForTxSuccess = waitForTxSuccess;
const axios_1 = __importDefault(require("axios"));
const HIRO_API_BASE = "https://api.testnet.hiro.so";
function waitForTxSuccess(txid_1) {
    return __awaiter(this, arguments, void 0, function* (txid, timeoutMs = 60000) {
        var _a, _b, _c;
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            const r = yield axios_1.default
                .get(`${HIRO_API_BASE}/extended/v1/tx/${txid}`)
                .then((x) => x.data);
            if (r.tx_status === "success")
                return r;
            if (((_a = r.tx_status) === null || _a === void 0 ? void 0 : _a.startsWith("abort")) || r.tx_status === "failed") {
                const reason = (_c = (_b = r.tx_result) === null || _b === void 0 ? void 0 : _b.repr) !== null && _c !== void 0 ? _c : r.tx_status;
                throw new Error(`payout failed: ${reason}`);
            }
            yield new Promise((res) => setTimeout(res, 3000));
        }
        throw new Error("payout pending timeout");
    });
}
//# sourceMappingURL=txChecker.js.map