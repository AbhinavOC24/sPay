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
exports.requireMerchant = requireMerchant;
// middleware/auth.ts
const prisma_client_1 = require("../utils/prisma-client");
function requireMerchant(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiKey = req.header("x-api-key");
        if (!apiKey)
            return res.status(401).json({ error: "Missing X-API-Key" });
        const merchant = yield prisma_client_1.prisma.merchant.findUnique({
            where: { apiKey },
            select: {
                id: true,
                name: true,
                email: true,
                apiKey: true,
                apiSecret: true,
                webhookUrl: true,
                webhookSecret: true,
                payoutStxAddress: true,
            },
        });
        if (!merchant)
            return res.status(401).json({ error: "Invalid API key" });
        req.merchant = merchant; // attach to request
        next();
    });
}
//# sourceMappingURL=auth.js.map