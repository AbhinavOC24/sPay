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
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const wallet_sdk_1 = require("@stacks/wallet-sdk");
const uuid_1 = require("uuid");
const zodCheck_1 = require("./zod/zodCheck");
const wallet_sdk_2 = require("@stacks/wallet-sdk");
const prisma_client_1 = require("./utils/prisma-client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const keys_1 = require("./utils/keys"); // you already have this
const chargeProcessor_1 = require("./utils/chargeProcessor");
const auth_1 = require("./middleware/auth");
const transferStx_1 = require("./utils/transferStx");
const deriveHotWallet_1 = require("./utils/deriveHotWallet");
const app = (0, express_1.default)();
app.use(express_1.default.json());
dotenv_1.default.config();
const arg = {
    secretKey: (0, wallet_sdk_2.generateSecretKey)(),
    // "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    password: "123123",
};
const hotWalletAddress = "ST22TVVHDDQDVTRBKB0AXJWX93SPT1QGQX3KXPSAR";
const FEE_BUFFER_STX = BigInt(100000); // 0.1 STX in microSTX
const mnemonicString = "benefit rough liar guitar scout task own edit stumble chunk fatal release ghost column donkey whale fan clean canvas sustain program field mean swallow";
const mnemonicArray = mnemonicString.trim().split(/\s+/);
app.listen(process.env.BACKEND_PORT, () => {
    console.log(`listening on port ${process.env.BACKEND_PORT}`);
    setInterval(() => {
        (0, chargeProcessor_1.processPendingCharges)().catch((e) => console.error("poller error", e));
    }, 10000);
});
app.post("/api/charge", auth_1.requireMerchant, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const parsed = zodCheck_1.paymentSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.message });
            return;
        }
        const merchant = req.merchant;
        if (!merchant)
            return;
        const newWallet = yield (0, wallet_sdk_1.generateWallet)(arg);
        const account = newWallet.accounts[0];
        if (!account) {
            res.status(500).json({ error: "wallet error" });
            return;
        }
        const privKey = account.stxPrivateKey;
        const address = (0, wallet_sdk_1.getStxAddress)(account, "testnet");
        const chargeId = (0, uuid_1.v4)();
        const microAmount = BigInt(Math.floor(parsed.data.amount * 100000000));
        const { stxPrivateKey, stxAddress } = yield (0, deriveHotWallet_1.deriveHotWallet)(mnemonicString);
        console.log("hotWallet address", stxAddress);
        yield (0, transferStx_1.transferStx)(stxPrivateKey, address, FEE_BUFFER_STX);
        // const webhookSecret = webhookUrl
        //   ? crypto.randomBytes(32).toString("hex")
        //   : null;
        const charge = yield prisma_client_1.prisma.charge.create({
            data: {
                chargeId,
                address,
                privKey,
                amount: microAmount,
                merchantid: merchant.id,
            },
        });
        console.log(charge);
        res.status(200).json({ address, charge_id: chargeId });
    }
    catch (error) {
        console.log(error);
    }
}));
// app.post("/api/merchants/signup", async (req: Request, res: Response) => {});
app.put("/api/merchants/config", auth_1.requireMerchant, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { payoutStxAddress, webhookUrl, webhookSecret } = req.body;
    const updated = yield prisma_client_1.prisma.merchant.update({
        where: { id: req.merchant.id },
        data: { payoutStxAddress, webhookUrl, webhookSecret },
        select: { id: true, payoutStxAddress: true, webhookUrl: true },
    });
    res.json(updated);
}));
app.post("/api/merchants/signup", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, email, password } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        if (!name || !email || !password) {
            return res.status(400).json({ error: "name, email, password required" });
        }
        const exists = yield prisma_client_1.prisma.merchant.findUnique({ where: { email } });
        if (exists)
            return res.status(409).json({ error: "Email already in use" });
        const hash = yield bcryptjs_1.default.hash(password, 10);
        const apiKey = (0, keys_1.genApiKey)();
        const apiSecret = (0, keys_1.genApiSecret)();
        const merchant = yield prisma_client_1.prisma.merchant.create({
            data: {
                name,
                email,
                password: hash,
                apiKey,
                apiSecret,
            },
            select: {
                id: true,
                name: true,
                email: true,
                apiKey: true,
                apiSecret: true,
                createdAt: true,
            },
        });
        // optional: set a short session cookie for a future dashboard
        const token = jsonwebtoken_1.default.sign({ sub: merchant.id }, process.env.JWT_SECRET, {
            expiresIn: "2h",
        });
        res.cookie("session", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: false, // set true behind HTTPS
            domain: process.env.COOKIE_DOMAIN || "localhost",
            maxAge: 2 * 60 * 60 * 1000,
        });
        return res.status(201).json(merchant); // includes apiKey + apiSecret
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "signup_failed" });
    }
}));
//# sourceMappingURL=index.js.map