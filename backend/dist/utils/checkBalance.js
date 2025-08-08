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
exports.addressHasSbtc = addressHasSbtc;
exports.pollPendingCharges = pollPendingCharges;
const prisma_client_1 = require("./prisma-client");
const axios_1 = __importDefault(require("axios"));
const HIRO_BASE = "https://api.testnet.hiro.so";
function addressHasSbtc(address, requiredAmount) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = `${HIRO_BASE}/extended/v1/address/${address}/balances`;
            const { data } = yield axios_1.default.get(url);
            console.log(data);
            const sbtcKey = Object.keys(data.fungible_tokens).find((key) => key.includes("sbtc"));
            if (!sbtcKey)
                return false;
            const balance = BigInt(data.fungible_tokens[sbtcKey].balance || "0");
            return balance >= requiredAmount;
        }
        catch (error) {
            console.log(error);
        }
    });
}
function pollPendingCharges() {
    return __awaiter(this, void 0, void 0, function* () {
        const pendingCharges = yield prisma_client_1.prisma.charge.findMany({
            where: { status: "PENDING" },
        });
        for (const charge of pendingCharges) {
            const paid = yield addressHasSbtc(charge.address, charge.amount);
            if (paid) {
                yield prisma_client_1.prisma.charge.update({
                    where: { id: charge.id },
                    data: { status: "CONFIRMED", paidAt: new Date() },
                });
                console.log(`Charge ${charge.chargeId} confirmed`);
            }
        }
    });
}
//# sourceMappingURL=checkBalance.js.map