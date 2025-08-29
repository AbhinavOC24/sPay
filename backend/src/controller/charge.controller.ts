import { Request, Response } from "express";
import prisma from "../db";
import QRCode from "qrcode";
import path from "path";
import toChargeEvent from "../utils/payment/publicPayloadBuilder";
import { eventBus, chargeTopic } from "../utils/eventBus";

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
