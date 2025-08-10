import express from "express";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { v4 as uuidv4 } from "uuid";
import { paymentSchema } from "./zod/zodCheck";
import { generateSecretKey } from "@stacks/wallet-sdk";
import { prisma } from "./utils/prisma-client";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { genApiKey, genApiSecret } from "./utils/keys"; // you already have this
import {
  makeRandomPrivKey,
  getAddressFromPrivateKey,
} from "@stacks/transactions";

import { TransactionVersion } from "@stacks/network";
import { uuid } from "zod";
import { processPendingCharges } from "./utils/chargeProcessor";
import { requireMerchant } from "./middleware/auth";
import { transferSbtc } from "./utils/transferSbtc";
import { transferStx } from "./utils/transferStx";
import { deriveHotWallet } from "./utils/deriveHotWallet";

const app = express();
app.use(express.json());

dotenv.config();
const arg = {
  secretKey: generateSecretKey(),
  // "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  password: "123123",
};

const hotWalletAddress = "ST22TVVHDDQDVTRBKB0AXJWX93SPT1QGQX3KXPSAR";
const FEE_BUFFER_STX = BigInt(100_000); // 0.1 STX in microSTX
const mnemonicString =
  "benefit rough liar guitar scout task own edit stumble chunk fatal release ghost column donkey whale fan clean canvas sustain program field mean swallow";
const mnemonicArray = mnemonicString.trim().split(/\s+/);

app.listen(process.env.BACKEND_PORT, () => {
  console.log(`listening on port ${process.env.BACKEND_PORT}`);
  setInterval(() => {
    processPendingCharges().catch((e: any) => console.error("poller error", e));
  }, 10_000);
});

app.post(
  "/api/charge",
  requireMerchant,
  async (req: Request, res: Response) => {
    try {
      const parsed = paymentSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }

      const merchant = req.merchant;

      if (!merchant) return;
      const newWallet = await generateWallet(arg);
      const account = newWallet.accounts[0];

      if (!account) {
        res.status(500).json({ error: "wallet error" });
        return;
      }
      const privKey = account.stxPrivateKey;
      const address = getStxAddress(account, "testnet");
      const chargeId = uuidv4();
      const microAmount = BigInt(Math.floor(parsed.data.amount * 100_000_000));

      const { stxPrivateKey, stxAddress } = await deriveHotWallet(
        mnemonicString
      );
      console.log("hotWallet address", stxAddress);
      await transferStx(stxPrivateKey, address, FEE_BUFFER_STX);

      // const webhookSecret = webhookUrl
      //   ? crypto.randomBytes(32).toString("hex")
      //   : null;

      const charge = await prisma.charge.create({
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
    } catch (error) {
      console.log(error);
    }
  }
);

// app.post("/api/merchants/signup", async (req: Request, res: Response) => {});

app.put("/api/merchants/config", requireMerchant, async (req, res) => {
  const { payoutStxAddress, webhookUrl, webhookSecret } = req.body;
  const updated = await prisma.merchant.update({
    where: { id: (req as any).merchant.id },
    data: { payoutStxAddress, webhookUrl, webhookSecret },
    select: { id: true, payoutStxAddress: true, webhookUrl: true },
  });
  res.json(updated);
});

app.post("/api/merchants/signup", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, password required" });
    }

    const exists = await prisma.merchant.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);
    const apiKey = genApiKey();
    const apiSecret = genApiSecret();

    const merchant = await prisma.merchant.create({
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
    const token = jwt.sign({ sub: merchant.id }, process.env.JWT_SECRET!, {
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
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "signup_failed" });
  }
});
