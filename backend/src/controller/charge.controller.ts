import { Request, Response } from "express";
import prisma from "../db";
import QRCode from "qrcode";
import path from "path";
import toChargeEvent from "../utils/payment/publicPayloadBuilder";
import { eventBus, chargeTopic } from "../utils/eventBus";
import { paymentSchema } from "../zod/zodCheck";
import {
  generateSecretKey,
  generateWallet,
  getStxAddress,
} from "@stacks/wallet-sdk";
import { v4 as uuidv4 } from "uuid";

import fetchUsdExchangeRate from "../utils/blockchain/fetchUsdExchangeRate";
import { deriveHotWallet } from "../utils/blockchain/deriveHotWallet";
import { calculateFeeBuffer } from "../utils/payment/feeCalculator";
import { transferAllStx, transferStx } from "../utils/blockchain/transferStx";

// GET /charges/:id
export async function getCharge(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "missing_charge_id" });

  const c = await prisma.charge.findUnique({
    where: { chargeId: id },
    select: {
      chargeId: true,
      address: true,
      amount: true,
      status: true,
      payoutTxId: true,
      createdAt: true,
      expiresAt: true,
      usdRate: true,
      success_url: true,
      cancel_url: true,
    },
  });
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json({
    ...toChargeEvent(c),
    success_url: c.success_url,
    cancel_url: c.cancel_url,
  });
}

// GET /charges/:id/events
export async function chargeEvents(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) {
    res.write(
      `event: charge.error\ndata: ${JSON.stringify({
        message: "missing_charge_id",
      })}\n\n`
    );
    res.end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let seq = Date.now();
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`id: ${++seq}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const c = await prisma.charge.findUnique({
    where: { chargeId: id },
    select: {
      chargeId: true,
      address: true,
      amount: true,
      status: true,
      payoutTxId: true,
      usdRate: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  if (c) send("charge.updated", toChargeEvent(c));
  else {
    send("charge.error", { message: "Charge not found", chargeId: id });
    res.end();
    return;
  }

  const topic = chargeTopic(id);
  const handler = (payload: any) => send("charge.updated", payload);
  eventBus.on(topic, handler);

  const keepAlive = setInterval(
    () => res.write(`: ping ${Date.now()}\n\n`),
    25000
  );

  req.on("close", () => {
    clearInterval(keepAlive);
    eventBus.off(topic, handler);
    res.end();
  });
}

// GET /charges/:id/qr.png
export async function chargeQr(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) return res.status(400).send("missing_charge_id");

  const c = await prisma.charge.findUnique({
    where: { chargeId: id },
    select: { address: true, amount: true },
  });
  if (!c) return res.status(404).send("Not found");

  const payload = JSON.stringify({
    token: "sBTC",
    to: c.address,
    amount: Number(c.amount),
  });
  const png = await QRCode.toBuffer(payload, {
    type: "png",
    margin: 1,
    scale: 6,
  });

  res.setHeader("Content-Type", "image/png");
  res.send(png);
}

// GET /checkout/:id
export async function checkoutPage(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) return res.status(400).send("missing_charge_id");

  const charge = await prisma.charge.findFirst({
    where: { chargeId: id },
    select: { chargeId: true, expiresAt: true },
  });

  if (!charge || !charge.expiresAt)
    return res.status(404).send("No such charge exists");

  const expired = Date.now() >= new Date(charge.expiresAt).getTime();
  res.set("Cache-Control", "no-store");

  if (expired) {
    return res
      .status(410)
      .sendFile(path.join(__dirname, "../public/expired.html"));
  }
  return res.sendFile(path.join(__dirname, "../public/checkout.html"));
}

// POST /charges/:id/cancel
export async function cancelCharge(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "missing_charge_id" });

  console.log(`🔄 Cancel request for charge: ${id}`);

  const current = await prisma.charge.findUnique({
    where: { chargeId: id },
    select: {
      chargeId: true,
      status: true,
      address: true,
      amount: true,
      payoutTxId: true,
      createdAt: true,
      privKey: true,
      usdRate: true,
      expiresAt: true,
      success_url: true,
      cancel_url: true,
    },
  });

  if (!current) return res.status(404).json({ error: "not_found" });
  if (current.status !== "PENDING")
    return res
      .status(409)
      .json({ error: "cannot_cancel", status: current.status });

  const r = await prisma.charge.updateMany({
    where: { chargeId: id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  if (r.count === 0) {
    const refreshed = await prisma.charge.findUnique({
      where: { chargeId: id },
      select: { status: true },
    });
    return res
      .status(409)
      .json({ error: "cannot_cancel", status: refreshed?.status || "UNKNOWN" });
  }

  try {
    const { stxAddress: hotAddr } = await deriveHotWallet(
      process.env.mnemonicString as string
    );
    console.log(`♻️ Refunding fee buffer from temp → hot wallet: `);

    // Sweep all balance back (minus a fee)
    await transferAllStx(current.privKey as string, hotAddr);
  } catch (err) {
    console.error("⚠️ Failed to refund STX buffer:", err);
    // you may want to keep going, don’t block cancellation UX
  }
  const updated = await prisma.charge.findUnique({
    where: { chargeId: id },
    select: {
      chargeId: true,
      address: true,
      amount: true,
      status: true,
      payoutTxId: true,
      createdAt: true,
      usdRate: true,
      expiresAt: true,
      success_url: true,
      cancel_url: true,
    },
  });

  console.log(
    `✅ Charge cancelled successfully. New status: ${updated?.status}`
  );
  eventBus.emit(chargeTopic(id), toChargeEvent(updated));

  return res.json({ ok: true, status: "CANCELLED" });
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
    // const microAmount = BigInt(Math.floor(parsed.data.amount * 100_000_000));
    const microAmount = btcToMicro(parsed.data.amount);
    console.log(microAmount);

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
function btcToMicro(amount: string | number): bigint {
  const s = String(amount);
  const [int, frac = ""] = s.split(".");
  const fracPadded = (frac + "00000000").slice(0, 8); // pad or trim to 8 decimals
  return BigInt(int as string) * 100_000_000n + BigInt(fracPadded);
}
