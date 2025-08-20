import express from "express";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { v4 as uuidv4 } from "uuid";
import { merchantLoginSchema, paymentSchema } from "./zod/zodCheck";
import { generateSecretKey } from "@stacks/wallet-sdk";
import prisma from "./db";
import QRCode from "qrcode";
import path from "path";
import cors from "cors";
import { merchantSignupSchema } from "./zod/zodCheck";

import bcrypt from "bcryptjs";

import { genApiKey, genApiSecret } from "./utils/keys";
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
import {
  recoverStuckCharges,
  retryFailedWebhooks,
  startChargeProcessor,
} from "./utils/payment/chargeProcessor";
import { checkDashBoardAuth, requireMerchant } from "./middleware/auth";

import { transferStx } from "./utils/blockchain/transferStx";
import { deriveHotWallet } from "./utils/blockchain/deriveHotWallet";
import { calculateFeeBuffer } from "./utils/payment/feeCalculator";
import toChargeEvent from "./utils/payment/publicPayloadBuilder";
import { chargeTopic, eventBus } from "./utils/eventBus";

import fetchUsdExchangeRate from "./utils/blockchain/fetchUsdExchangeRate";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";

const app = express();
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "public")));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL, // or user/pass/host/db separately
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool: pgPool, // connection pool
      tableName: "session", // you can override the table name (default is "session")
      createTableIfMissing: true, // 👈 auto-creates session table
    }),
    secret: process.env.FOO_COOKIE_SECRET || "123123123",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production", // cookie over https only in prod
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
    },
  })
);

// app.use(
//   session({
//     secret: "super-secret-key",
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       secure: process.env.NODE_ENV === "production",
//       httpOnly: true,
//       maxAge: 1000 * 60 * 60 * 24 * 7,
//       sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
//     },
//   })
// );

dotenv.config();

app.listen(process.env.BACKEND_PORT, () => {
  console.log(`listening on port ${process.env.BACKEND_PORT}`);

  startChargeProcessor();
  setInterval(() => retryFailedWebhooks(), 60_000);

  setInterval(() => recoverStuckCharges(), 5 * 60_000);
});

app.post(
  "/api/charge",
  requireMerchant,
  async (req: Request, res: Response) => {
    try {
      const key = req.get("Idempotency-Key");
      if (!key) {
        res.status(400).json({ error: "missing_idempotency_key" });
        return;
      }
      if (!req.merchant) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      const existing = await prisma.charge.findUnique({
        where: {
          merchantid_idempotencyKey: {
            merchantid: req.merchant.id,
            idempotencyKey: key,
          },
        },
      });
      if (existing) return res.json({ Error: "Duplicate charge" });

      const parsed = paymentSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }

      const merchant = req.merchant;

      if (!merchant) return;
      const arg = {
        secretKey: generateSecretKey(),
        password: process.env.password as string,
      };
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
      const rateUsd = await fetchUsdExchangeRate();

      const amountUsd = Number(parsed.data.amount) * rateUsd;
      const { stxPrivateKey, stxAddress } = await deriveHotWallet(
        process.env.mnemonicString as string
      );
      console.log("hotWallet address", stxAddress);
      // await transferStx(stxPrivateKey, address, FEE_BUFFER_STX);

      const dynamicFeeBuffer = await calculateFeeBuffer();
      console.log(
        `📊 Using dynamic fee: ${dynamicFeeBuffer} microSTX (instead of fixed 100,000)`
      );
      await transferStx(stxPrivateKey, address, dynamicFeeBuffer);
      console.log(`✅ Transferred dynamic fee buffer to temp wallet`);

      const manualCharge = parsed.data.manual ?? false;
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
          isManual: manualCharge,
          expiresAt,
        },
      });

      console.log(charge);
      const paymentUrl = `${process.env.BACKEND_URL}/checkout/${chargeId}`;
      // res.json({
      //   chargeId: charge.chargeId,
      //   checkout_url: `${process.env.PUBLIC_BASE_URL}/checkout/${charge.chargeId}`,
      //   status_url: `${process.env.PUBLIC_BASE_URL}/charges/${charge.chargeId}`,
      //   events_url: `${process.env.PUBLIC_BASE_URL}/charges/${charge.chargeId}/events`,
      //   expires_at: expiresAt.toISOString(),
      // });
      res.status(200).json({ address, charge_id: chargeId, paymentUrl });
    } catch (error) {
      console.log(error);
    }
  }
);

app.put("/api/merchants/config", checkDashBoardAuth, async (req, res) => {
  const { payoutStxAddress, webhookUrl, webhookSecret } = req.body;

  // Build data object with only provided fields
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
});

app.post("/api/merchants/signup", async (req: Request, res: Response) => {
  try {
    const parsed = merchantSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.flatten().fieldErrors });
    }

    const { name, email, password } = parsed.data;

    // Check if merchant already exists
    const exists = await prisma.merchant.findUnique({ where: { email } });
    if (exists) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Generate API credentials
    const apiKey = genApiKey();
    const apiSecret = genApiSecret();

    // Create merchant
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
        payoutStxAddress: true,
        webhookSecret: true,
        webhookUrl: true,
      },
    });

    // Set session
    req.session.authenticated = true;
    req.session.merchantId = merchant.id;

    return res.status(201).json({
      message: "Merchant account created successfully",
      merchant,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "signup_failed" });
  }
});

app.post("/api/merchants/login", async (req: Request, res: Response) => {
  try {
    const parsed = merchantLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.flatten().fieldErrors });
    }

    const { email, password } = parsed.data;

    const merchant = await prisma.merchant.findUnique({ where: { email } });
    if (!merchant) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, merchant.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Set session
    req.session.authenticated = true;
    req.session.merchantId = merchant.id;

    return res.json({
      message: "Login successful",
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
});

app.post("/api/merchants/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "logout_failed" });
    }
    res.clearCookie("connect.sid"); // default cookie name for express-session
    return res.json({ message: "Logged out successfully" });
  });
});

app.get(
  "/api/merchants/me",
  checkDashBoardAuth,
  async (req: Request, res: Response) => {
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
);
app.get(
  "/api/merchants/charges",
  checkDashBoardAuth,
  async (req: Request, res: Response) => {
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
);

// ---- snapshot endpoint (used by checkout + fallback) ----
app.get("/charges/:id", async (req, res) => {
  const { id } = req.params;
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
});

// ---- SSE endpoint (live updates to the browser) ----
app.get("/charges/:id/events", async (req, res) => {
  const { id } = req.params;

  // Important SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // If you have compression middleware enabled globally, consider disabling it here.

  // push one event
  let seq = Date.now(); // simple monotonic id base
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`id: ${++seq}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // send current snapshot immediately
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

  // subscribe to event bus
  const topic = chargeTopic(id);
  const handler = (payload: any) => send("charge.updated", payload);
  eventBus.on(topic, handler);

  // keep-alive ping every 25s (comment lines are valid SSE)
  const keepAlive = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25000);

  // cleanup
  req.on("close", () => {
    clearInterval(keepAlive);
    eventBus.off(topic, handler);
    res.end();
  });
});

app.get("/charges/:id/qr.png", async (req, res) => {
  const { id } = req.params;
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

  // 👇 This returns a Buffer<png>
  const png = await QRCode.toBuffer(payload, {
    type: "png",
    margin: 1,
    scale: 6,
  });

  res.setHeader("Content-Type", "image/png");
  res.send(png);
});

app.get("/checkout/:id", async (req, res) => {
  const { id } = req.params;
  const charge = await prisma.charge.findFirst({
    where: { chargeId: id },
    select: { chargeId: true, expiresAt: true },
  });

  if (!charge || !charge.expiresAt) {
    return res.status(404).send("No such charge exists");
  }

  const expired = Date.now() >= new Date(charge.expiresAt).getTime();
  res.set("Cache-Control", "no-store");

  if (expired) {
    return res
      .status(410)
      .sendFile(path.join(__dirname, "public", "expired.html"));
  }

  // Not expired → show checkout page
  return res.sendFile(path.join(__dirname, "public", "checkout.html"));
});

app.post("/charges/:id/cancel", async (req, res) => {
  const id = req.params.id;
  console.log(`🔄 Cancel request for charge: ${id}`);

  // fetch current status (to report helpful errors)
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

  if (!current) {
    console.log(`❌ Charge not found: ${id}`);
    return res.status(404).json({ error: "not_found" });
  }

  console.log(`📊 Current charge status: ${current.status}`);

  if (current.status !== "PENDING") {
    console.log(`❌ Cannot cancel charge in ${current.status} status`);
    return res
      .status(409)
      .json({ error: "cannot_cancel", status: current.status });
  }

  // race-safe: update only if still PENDING
  console.log(`🔄 Attempting to cancel charge...`);
  const r = await prisma.charge.updateMany({
    where: { chargeId: id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  console.log(`📊 Update result count: ${r.count}`);

  if (r.count === 0) {
    // someone else changed it between read and write
    const refreshed = await prisma.charge.findUnique({
      where: { chargeId: id },
      select: { status: true },
    });
    console.log(`❌ Race condition - status changed to: ${refreshed?.status}`);
    return res
      .status(409)
      .json({ error: "cannot_cancel", status: refreshed?.status || "UNKNOWN" });
  }

  // re-fetch for SSE payload
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

  console.log(`📡 Emitting SSE event for charge: ${id}`);

  eventBus.emit(chargeTopic(id), toChargeEvent(updated));

  return res.json({ ok: true, status: "CANCELLED" });
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
