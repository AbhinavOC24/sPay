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
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferStx = transferStx;
// utils/transferStx.ts
const transactions_1 = require("@stacks/transactions");
const network_1 = require("@stacks/network");
function transferStx(senderKey, recipient, amountMicroStx) {
    return __awaiter(this, void 0, void 0, function* () {
        const tx = yield (0, transactions_1.makeSTXTokenTransfer)({
            recipient,
            amount: amountMicroStx, // e.g., 100_000n for 0.1 STX
            senderKey,
            network: network_1.STACKS_TESTNET,
        });
        const res = yield (0, transactions_1.broadcastTransaction)({
            transaction: tx,
            network: network_1.STACKS_TESTNET,
        });
        return res; // txid or error
    });
}
//# sourceMappingURL=transferStx.js.map