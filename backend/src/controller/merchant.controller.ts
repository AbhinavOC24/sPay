import { Request, Response } from "express";
import prisma from "../db";
import bcrypt from "bcryptjs";
import { merchantSignupSchema, merchantLoginSchema } from "../zod/zodCheck";
import { genApiKey, genApiSecret } from "../utils/keys";
import {
  generateWallet,
  getStxAddress,
  generateSecretKey,
} from "@stacks/wallet-sdk";
import { v4 as uuidv4 } from "uuid";

import fetchUsdExchangeRate from "../utils/blockchain/fetchUsdExchangeRate";
import { deriveHotWallet } from "../utils/blockchain/deriveHotWallet";
import { transferStx } from "../utils/blockchain/transferStx";
import { calculateFeeBuffer } from "../utils/payment/feeCalculator";
import { paymentSchema } from "../zod/zodCheck";

export async function updateConfig(req: Request, res: Response) {
  const { payoutStxAddress, webhookUrl, webhookSecret } = req.body;
  const data: Record<string, any> = {};
  if (payoutStxAddress !== undefined) data.payoutStxAddress = payoutStxAddress;
  if (webhookUrl !== undefined) data.webhookUrl = webhookUrl;
  if (webhookSecret !== undefined) data.webhookSecret = webhookSecret;

  try {
    const updated = await prisma.merchant.update({
      where: { id: req.session.merchantId as string },
      data,
      select: {
        id: true,
        payoutStxAddress: true,
        webhookUrl: true,
        webhookSecret: true,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "update_failed" });
  }
}

export async function signup(req: Request, res: Response) {
  try {
    const parsed = merchantSignupSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: parsed.error.flatten().fieldErrors });

    const { name, email, password } = parsed.data;
    if (await prisma.merchant.findUnique({ where: { email } }))
      return res.status(409).json({ error: "email_in_use" });

    const hash = await bcrypt.hash(password, 10);
    const apiKey = genApiKey();
    const apiSecret = genApiSecret();

    const merchant = await prisma.merchant.create({
      data: { name, email, password: hash, apiKey, apiSecret },
      select: {
        id: true,
        name: true,
        email: true,
        apiKey: true,
        apiSecret: true,
        createdAt: true,
        payoutStxAddress: true,
        webhookSecret: true,
        webhookUrl: true,
      },
    });

    req.session.authenticated = true;
    req.session.merchantId = merchant.id;
    return res.status(201).json({ message: "signup_success", merchant });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "signup_failed" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = merchantLoginSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: parsed.error.flatten().fieldErrors });

    const { email, password } = parsed.data;
    const merchant = await prisma.merchant.findUnique({ where: { email } });
    if (!merchant)
      return res.status(401).json({ error: "invalid_credentials" });

    const isMatch = await bcrypt.compare(password, merchant.password);
    if (!isMatch) return res.status(401).json({ error: "invalid_credentials" });

    req.session.authenticated = true;
    req.session.merchantId = merchant.id;

    return res.json({
      message: "login_success",
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        apiKey: merchant.apiKey,
        apiSecret: merchant.apiSecret,
        payoutStxAddress: merchant.payoutStxAddress,
        webhookSecret: merchant.webhookSecret,
        webhookUrl: merchant.webhookUrl,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "login_failed" });
  }
}

export function logout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "logout_failed" });
    res.clearCookie("connect.sid");
    return res.json({ message: "logout_success" });
  });
}

export async function me(req: Request, res: Response) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: req.session.merchantId as string },
    select: {
      id: true,
      name: true,
      email: true,
      apiKey: true,
      apiSecret: true,
      payoutStxAddress: true,
      webhookSecret: true,
      webhookUrl: true,
    },
  });
  res.json(merchant);
}

export async function listCharges(req: Request, res: Response) {
  try {
    const charges = await prisma.charge.findMany({
      where: { merchantid: req.session.merchantId as string },
      orderBy: { createdAt: "desc" },
      select: {
        chargeId: true,
        amount: true,
        usdRate: true,
        status: true,
        createdAt: true,
        paidAt: true,
        payoutTxId: true,
        failureReason: true,
      },
    });

    const formatted = charges.map((c) => ({
      chargeId: c.chargeId,
      amountSbtc: Number(c.amount) / 100_000_000,
      amountUsd: (Number(c.amount) / 100_000_000) * (c.usdRate || 1),
      status: c.status,
      createdAt: c.createdAt,
      paidAt: c.paidAt,
      payoutTxId: c.payoutTxId,
      failureReason: c.failureReason,
    }));

    res.json({ charges: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "fetch_charges_failed" });
  }
}

export async function createCharge(req: Request, res: Response) {
  try {
    const key = req.get("Idempotency-Key");
    if (!key) return res.status(400).json({ error: "missing_idempotency_key" });
    if (!req.merchant) return res.status(401).json({ error: "unauthorized" });

    // Prevent duplicates
    const existing = await prisma.charge.findUnique({
      where: {
        merchantid_idempotencyKey: {
          merchantid: req.merchant.id,
          idempotencyKey: key,
        },
      },
    });
    if (existing) return res.json({ error: "duplicate_charge" });

    // Validate input
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const merchant = req.merchant;
    if (!merchant) return;

    // Generate temp wallet
    const newWallet = await generateWallet({
      secretKey: generateSecretKey(),
      password: process.env.password as string,
    });
    const account = newWallet.accounts[0];
    if (!account) return res.status(500).json({ error: "wallet_error" });

    const privKey = account.stxPrivateKey;
    const address = getStxAddress(account, "testnet");

    const chargeId = uuidv4();
    // Calculate amounts
    const microAmount = BigInt(Math.floor(parsed.data.amount * 100_000_000));
    const rateUsd = await fetchUsdExchangeRate();
    const amountUsd = Number(parsed.data.amount) * rateUsd;

    // Top up fee buffer
    const { stxPrivateKey, stxAddress } = await deriveHotWallet(
      process.env.mnemonicString as string
    );
    console.log("hotWallet address", stxAddress);
    const dynamicFeeBuffer = await calculateFeeBuffer();
    await transferStx(stxPrivateKey, address, dynamicFeeBuffer);

    const TTL_MIN = 15;
    const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000);
    const charge = await prisma.charge.create({
      data: {
        chargeId,
        address,
        privKey,
        amount: microAmount,
        success_url: parsed.data.success_url,
        cancel_url: parsed.data.cancel_url,
        merchantid: merchant.id,
        idempotencyKey: key,
        usdRate: amountUsd,
        isManual: parsed.data.manual ?? false,
        expiresAt,
      },
    });

    const paymentUrl = `${process.env.BACKEND_URL}/charges/checkout/${chargeId}`;
    return res.status(200).json({ address, charge_id: chargeId, paymentUrl });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "charge_failed" });
  }
}
