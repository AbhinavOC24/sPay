"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const wallet_sdk_1 = require("@stacks/wallet-sdk");
const uuid_1 = require("uuid");
const zodCheck_1 = require("./zod/zodCheck");
const wallet_sdk_2 = require("@stacks/wallet-sdk");
const prisma_client_1 = require("./utils/prisma-client");
const crypto = __importStar(require("crypto"));
const chargeProcessor_1 = require("./utils/chargeProcessor");
const app = (0, express_1.default)();
app.use(express_1.default.json());
dotenv_1.default.config();
const arg = {
    secretKey: (0, wallet_sdk_2.generateSecretKey)(),
    // "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    password: "123123",
};
app.listen(process.env.BACKEND_PORT, () => {
    console.log(`listening on port ${process.env.BACKEND_PORT}`);
    setInterval(() => {
        (0, chargeProcessor_1.processPendingCharges)().catch((e) => console.error("poller error", e));
    }, 10000);
});
app.post("/api/charge", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const parsed = zodCheck_1.paymentSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.message });
            return;
        }
        const newWallet = yield (0, wallet_sdk_1.generateWallet)(arg);
        const account = newWallet.accounts[0];
        if (!account) {
            res.status(500).json({ error: "wallet error" });
            return;
        }
        const privKey = account.stxPrivateKey;
        const address = (0, wallet_sdk_1.getStxAddress)(account, "testnet");
        const chargeId = (0, uuid_1.v4)();
        const microAmount = BigInt(Math.floor(parsed.data.amount * 1000000));
        const { webhookUrl } = parsed.data;
        const webhookSecret = webhookUrl
            ? crypto.randomBytes(32).toString("hex")
            : null;
        const charge = yield prisma_client_1.prisma.charge.create({
            data: {
                chargeId,
                address,
                privKey,
                amount: microAmount,
                webhookUrl,
                webhookSecret,
            },
        });
        console.log(charge);
        res.status(200).json({ address, charge_id: chargeId });
    }
    catch (error) {
        console.log(error);
    }
}));
//# sourceMappingURL=index.js.map