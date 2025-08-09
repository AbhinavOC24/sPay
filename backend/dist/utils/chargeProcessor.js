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
exports.processPendingCharges = processPendingCharges;
exports.hasRequiredSbtcBalance = hasRequiredSbtcBalance;
const prisma_client_1 = require("./prisma-client");
const axios_1 = __importDefault(require("axios"));
const deliverChargeWebhook_1 = require("./deliverChargeWebhook");
const HIRO_API_BASE = "https://api.testnet.hiro.so";
// Poll for charges that are pending and confirm them if payment is detected
function processPendingCharges() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const pendingCharges = yield prisma_client_1.prisma.charge.findMany({
            where: { status: "PENDING" },
        });
        for (const charge of pendingCharges) {
            const paid = yield hasRequiredSbtcBalance(charge.address, charge.amount);
            if (paid) {
                const updated = yield prisma_client_1.prisma.charge.update({
                    where: { id: charge.id },
                    data: { status: "CONFIRMED", paidAt: new Date() },
                });
                console.log(`Charge ${charge.chargeId} confirmed`);
                if (updated.webhookUrl &&
                    updated.webhookSecret &&
                    updated.webhookLastStatus !== "SUCCESS") {
                    yield (0, deliverChargeWebhook_1.deliverChargeConfirmedWebhook)({
                        payload: {
                            chargeId: updated.chargeId,
                            address: updated.address,
                            amount: String(updated.amount),
                            paidAt: (_a = updated.paidAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
                        },
                        config: {
                            url: updated.webhookUrl,
                            secret: updated.webhookSecret,
                        },
                    });
                }
            }
        }
    });
}
// Check if an address has enough SBTC balance
function hasRequiredSbtcBalance(address, requiredAmount) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = `${HIRO_API_BASE}/extended/v1/address/${address}/balances`;
            const { data } = yield axios_1.default.get(url);
            const sbtcKey = Object.keys(data.fungible_tokens).find((key) => key.includes("sbtc"));
            if (!sbtcKey)
                return false;
            const balance = BigInt(data.fungible_tokens[sbtcKey].balance || "0");
            return balance >= requiredAmount;
        }
        catch (error) {
            console.error(error);
        }
    });
}
//# sourceMappingURL=chargeProcessor.js.map