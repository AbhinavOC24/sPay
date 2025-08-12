import express from "express";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { v4 as uuidv4 } from "uuid";
import { paymentSchema } from "./zod/zodCheck";
import { generateSecretKey } from "@stacks/wallet-sdk";
import prisma from "./db";
import QRCode from "qrcode";
import path from "path";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { genApiKey, genApiSecret } from "./utils/keys"; // you already have this
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
import {
  processPendingCharges,
  recoverStuckCharges,
  retryFailedWebhooks,
  startChargeProcessor,
} from "./utils/chargeProcessor";
import { requireMerchant } from "./middleware/auth";

import { transferStx } from "./utils/transferStx";
import { deriveHotWallet } from "./utils/deriveHotWallet";
import { calculateFeeBuffer } from "./utils/feeCalculator";
import toChargeEvent from "./utils/publicPayloadBuilder";
import { chargeTopic, eventBus } from "./utils/eventBus";
import { CANCELLED } from "dns";

const app = express();
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "public")));

dotenv.config();

app.listen(process.env.BACKEND_PORT, () => {
  console.log(`listening on port ${process.env.BACKEND_PORT}`);

  startChargeProcessor();
  setInterval(() => retryFailedWebhooks(), 60_000); // every 1 min

  // recover payouts that look stuck less often
  setInterval(() => recoverStuckCharges(), 5 * 60_000); // every 5 min
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

      // Fast path: replay same logical request
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
        // "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
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

      // const webhookSecret = webhookUrl
      //   ? crypto.randomBytes(32).toString("hex")
      //   : null;
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
          expiresAt,
        },
      });

      console.log(charge);
      // res.json({
      //   chargeId: charge.chargeId,
      //   checkout_url: `${process.env.PUBLIC_BASE_URL}/checkout/${charge.chargeId}`,
      //   status_url: `${process.env.PUBLIC_BASE_URL}/charges/${charge.chargeId}`,
      //   events_url: `${process.env.PUBLIC_BASE_URL}/charges/${charge.chargeId}/events`,
      //   expires_at: expiresAt.toISOString(),
      // });
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
  res.sendFile(path.join(__dirname, "public", "checkout.html"));

  // <html>
  // <head>
  // <meta charset="utf-8"/>
  // <meta name="viewport" content="width=device-width,initial-scale=1"/>
  // <title>Pay with sBTC</title>
  // <style>
  //   :root{--bd:#e5e7eb;--muted:#6b7280;--ok:#0f766e;--warn:#b45309;--err:#b91c1c;}
  //   body{font-family:system-ui, -apple-system, Segoe UI, Roboto; background:#fafafa; padding:24px;}
  //   .wrap{max-width:560px;margin:0 auto;}
  //   .card{background:#fff;border:1px solid var(--bd);border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  //   .row{display:flex;gap:16px;align-items:center}
  //   .qr{width:160px;height:160px;border:1px solid var(--bd);border-radius:10px;display:flex;align-items:center;justify-content:center}
  //   .label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  //   .value{font-weight:700;font-size:18px}
  //   code{background:#f3f4f6;padding:6px 8px;border-radius:8px;display:block;overflow:auto}
  //   .actions{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap}
  //   button,.btn{border:1px solid var(--bd);background:#fff;padding:8px 12px;border-radius:10px;cursor:pointer}
  //   .status{margin-top:12px;font-weight:700}
  //   .muted{color:var(--muted)} .ok{color:var(--ok)} .warn{color:var(--warn)} .err{color:var(--err)}
  // </style>
  // </head>
  // <body>
  // <div class="wrap">
  //   <div class="card">
  //     <h2>Complete your sBTC payment</h2>
  //     <div class="row">
  //       <div class="qr"><img id="qr" src="/charges/${
  //         c.chargeId
  //       }/qr.png" width="150" height="150" alt="QR"/></div>
  //       <div style="flex:1">
  //         <div class="label">Amount</div>
  //         <div class="value"><span id="amt">—</span> sBTC</div>
  //         <div style="height:8px"></div>
  //         <div class="label">Send to</div>
  //         <code id="addr">—</code>
  //         <div class="actions">
  //           <button id="copyAddr">Copy address</button>
  //           <button id="copyAmt">Copy amount</button>
  //           <a class="btn" id="cancel" href="${c.cancel_url ?? "#"}">Cancel</a>
  //         </div>
  //         <div id="timer" class="muted">Expires in —:—</div>
  //       </div>
  //     </div>
  //     <div id="status" class="status">Status: ${c.status}</div>
  //     <div id="hint" class="muted">Waiting for payment…</div>
  //     <small class="muted">Keep this tab open. It updates automatically.</small>
  //   </div>
  // </div>

  // <script>
  //   const chargeId = ${JSON.stringify(c.chargeId)};
  //   const successUrl = ${JSON.stringify(c.success_url || "")};
  //   const addrEl = document.getElementById("addr");
  //   const amtEl  = document.getElementById("amt");
  //   const stEl   = document.getElementById("status");
  //   const hintEl = document.getElementById("hint");
  //   const timerEl= document.getElementById("timer");

  //   document.getElementById("copyAddr").onclick = () => navigator.clipboard.writeText(addrEl.textContent.trim());
  //   document.getElementById("copyAmt").onclick  = () => navigator.clipboard.writeText(amtEl.textContent.trim());

  //   function fmt(v){ try { return (Number(v)/1e8).toFixed(8).replace(/0+$/,'').replace(/\\.$/,''); } catch { return String(v); } }

  //   let lastStatus = ${JSON.stringify(c.status)};

  //   function render(c){
  //     if (c.address) addrEl.textContent = c.address;
  //     if (c.amount != null) amtEl.textContent = fmt(c.amount);
  //     stEl.textContent = "Status: " + c.status;

  //     const secs = Math.max(0, Number(c.remainingSec || 0));
  //     const mm = String(Math.floor(secs/60)).padStart(2,'0');
  //     const ss = String(secs%60).padStart(2,'0');
  //     timerEl.textContent = "Expires in " + mm + ":" + ss;

  //     if (c.status === "PENDING") { hintEl.textContent="Waiting for payment…"; hintEl.className="muted"; }
  //     else if (c.status === "DETECTED") { hintEl.textContent="Payment detected. Finalizing…"; hintEl.className="warn"; }
  //     else if (c.status === "CONFIRMED") {
  //       hintEl.textContent="Payment successful ✓"; hintEl.className="ok";
  //       if (lastStatus !== "CONFIRMED" && successUrl) {
  //         setTimeout(() => {
  //           const u = new URL(successUrl);
  //           u.searchParams.set("charge_id", c.chargeId);
  //           if (c.txid) u.searchParams.set("txid", c.txid);
  //           u.searchParams.set("status", "CONFIRMED");
  //           location.href = u.toString();
  //         }, 1200);
  //       }
  //     } else if (c.status === "UNDERPAID") { hintEl.textContent="Amount too low. Contact the merchant."; hintEl.className="err"; }
  //     else if (c.status === "EXPIRED" || secs===0) { hintEl.textContent="Link expired. Return to the store."; hintEl.className="err"; }
  //     lastStatus = c.status;
  //   }

  //   // 1) Open SSE stream
  //   const es = new EventSource("/charges/" + chargeId + "/events");

  //   es.addEventListener("charge.updated", (e) => {
  //     try { render(JSON.parse(e.data)); } catch (_) {}
  //   });

  //   es.addEventListener("charge.error", (e) => {
  //     hintEl.textContent = "Error: " + e.data;
  //     hintEl.className = "err";
  //   });

  //   // 2) Fallback to polling if SSE fails (network, proxy)
  //   es.onerror = () => {
  //     es.close();
  //     setInterval(async () => {
  //       try {
  //         const r = await fetch("/charges/" + chargeId, { cache: "no-store" });
  //         if (r.ok) render(await r.json());
  //       } catch {}
  //     }, 5000);
  //   };
  // </script>
  // </body>
  // </html>`);
});

// POST /charges/:id/cancel  — only if status === PENDING
// POST /charges/:id/cancel with debugging
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
      expiresAt: true,
      success_url: true,
      cancel_url: true,
    },
  });

  console.log(
    `✅ Charge cancelled successfully. New status: ${updated?.status}`
  );

  // emit SSE update
  const payload = toChargeEvent({
    ...updated!,
    amount:
      typeof updated!.amount === "bigint"
        ? updated!.amount.toString()
        : (updated as any).amount,
  } as any);
  payload.status = "CANCELLED";
  console.log(`📡 Emitting SSE event for charge: ${id}`);
  console.log(`📡 SSE payload:`, payload);

  eventBus.emit(chargeTopic(id), payload);

  return res.json({ ok: true, status: "CANCELLED" });
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
