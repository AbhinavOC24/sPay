import express from "express";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { v4 as uuidv4 } from "uuid";
import { paymentSchema } from "./zod/zodCheck";
import { generateSecretKey } from "@stacks/wallet-sdk";
import { prisma } from "./utils/prisma-client";
import * as crypto from "crypto";

import {
  makeRandomPrivKey,
  getAddressFromPrivateKey,
} from "@stacks/transactions";

import { TransactionVersion } from "@stacks/network";
import { uuid } from "zod";
import { processPendingCharges } from "./utils/chargeProcessor";
import { requireMerchant } from "./middleware/auth";

const app = express();
app.use(express.json());

dotenv.config();
const arg = {
  secretKey: generateSecretKey(),
  // "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  password: "123123",
};

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
      const microAmount = BigInt(Math.floor(parsed.data.amount * 1_000_000));

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

app.post("/api/merchants/signup", async (req: Request, res: Response) => {});
