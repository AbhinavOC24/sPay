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
exports.requireMerchant = requireMerchant;
// middleware/auth.ts
const db_1 = __importDefault(require("../db"));
function requireMerchant(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        // Prefer Authorization: Bearer <apiKey>:<apiSecret>
        const auth = req.header("authorization");
        if (auth === null || auth === void 0 ? void 0 : auth.startsWith("Bearer ")) {
            const token = auth.slice("Bearer ".length).trim();
            const [apiKey, apiSecret] = token.split(":");
            if (!apiKey || !apiSecret) {
                return res.status(401).json({ error: "invalid_auth_format" });
            }
            const merchant = yield db_1.default.merchant.findUnique({
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
            if (!merchant || merchant.apiSecret !== apiSecret) {
                return res.status(401).json({ error: "invalid_credentials" });
            }
            req.merchant = merchant;
            return next();
        }
        // Back-compat: allow x-api-key only (legacy)
        const apiKey = req.header("x-api-key");
        if (apiKey) {
            const merchant = yield db_1.default.merchant.findUnique({
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
                return res.status(401).json({ error: "invalid_api_key" });
            req.merchant = merchant;
            return next();
        }
        return res.status(401).json({ error: "missing_auth" });
    });
}
//# sourceMappingURL=auth.js.map