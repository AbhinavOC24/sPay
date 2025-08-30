# 🟠 sPay – sBTC Payment Gateway

> Stripe-style payment processing for **Bitcoin on Stacks** (sBTC).  
> Built for the [Stacks Builders Challenge](https://dorahacks.io/) – Hackathon Aug–Sept 2025.

## 📌 What is sPay?

sPay is a developer-friendly **payment gateway for sBTC**. It lets businesses accept sBTC payments seamlessly via the Stacks blockchain, with the UX simplicity of Stripe.

- ⚡ **Fast setup** – create charges via API, redirect customers to checkout, and receive webhooks.
- 🔄 **Stripe-like state machine** – charges flow through a well-defined lifecycle, ensuring consistency and reliability.  
- 🛡 **Secure** – temporary wallets per charge, HMAC-signed webhooks, no secrets leaked client-side.  
- 🖥 **Clean DX/UX** – polished checkout UI, developer docs, and a basic merchant dashboard.  
- ♻️ **Idempotent design** – charge creation and webhook delivery are idempotent, preventing duplicates.  
- ⚙️ **Atomic operations** – ensures payment status updates, transfers, and webhooks stay consistent.  
- 🩺 **DB resilience** – automatic checks and recovery if the database restarts, errors, or drops connections.  

## 📖 Documentation

You can explore developer docs in two formats:

[👉 View Docs (Vercel)](https://spay-docs.vercel.app)

[👉 View Docs (GitBook)](https://spay.gitbook.io/spay-docs)

Both contain:

Getting Started → Overview, Quickstart

Core APIs → Merchant API, Payment API

Integrations → Webhooks, Charge Lifecycle

Charge Lifecycle → State machine, Master wallet funding flow

The Vercel-hosted Docsify site is the canonical source and will stay free + open-source, while GitBook may remain static due to export limitations.

## 🎥 Demo Video

📺 [Link to 5-min demo](#) (Yet to upload)

## 🚀 Features

- **Stripe-like state machine** – ensures reliable charge lifecycle management  
- Hosted **checkout page** with QR code + live status  
- Auto-transfer from **temp wallet → merchant payout wallet**  
- **Webhook delivery** with HMAC signatures  
- Handles **expiry, cancellation, and underpayment**  
- **sBTC → USD conversion** (for reference pricing)  
- Polished **expired/checkout states**  
- **Retry logic** for payouts & webhooks  

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Prisma, PostgreSQL
- **Blockchain**: Stacks
- **Frontend (Merchant Dashboard)**: Next.js
- **Frontend (Checkout)**: Vanilla HTML/CSS/JS
- **Infra**: EventSource (SSE) + polling fallback
- **Security**: HMAC webhook signing, API key + secret auth

## 📂 Project Structure

```
src
├── controller/           # Controllers for routes
│   ├── charge.controller.ts
│   └── merchant.controller.ts
├── db/                   # Prisma client (singleton)
│   └── index.ts
├── middleware/           # Auth middleware (API key + secret)
│   └── auth.ts
├── mock-webhook-server.ts # Local test server for webhook dev
├── public/               # Static checkout pages
│   ├── checkout.html
│   ├── checkout.css
│   ├── checkout.js
│   └── expired.html
├── routes/               # Express routers
│   ├── charge.routes.ts
│   └── merchant.routes.ts
├── types/                # Shared TS types
│   └── types.ts
├── utils/
│   ├── blockchain/       # Blockchain helpers (sBTC + STX)
│   │   ├── checksBTC.ts
│   │   ├── checkTxStatus.ts
│   │   ├── deriveHotWallet.ts
│   │   ├── fetchUsdExchangeRate.ts
│   │   ├── transferSbtc.ts
│   │   └── transferStx.ts
│   ├── dbChecker/        # DB health monitor
│   │   └── dbChecker.ts
│   ├── eventBus.ts       # Internal event bus (SSE + updates)
│   ├── keys.ts           # Key generators
│   └── payment/          # Core payment state machine + helpers
│       ├── chargeProcessor.ts
│       ├── deliverChargeWebhook.ts
│       ├── feeCalculator.ts
│       ├── markChargeFailed.ts
│       ├── publicPayloadBuilder.ts
│       └── publishChargeUpdate.ts
├── zod/                  # Input validation schemas
│   └── zodCheck.ts
├── index.ts              # Express entrypoint
└── express.d.ts          # Type declarations
```

## ⚡ Quickstart

### 1. Clone & Install

```bash
git clone https://github.com/YOURNAME/spay.git
cd backend
npm install
cd ../frontend
npm install
```

### 2. Environment Setup

```env
BACKEND_PORT=8000
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
mnemonicString = //masterWallet
password=
NODE_ENV="development"
BACKEND_URL=
FRONTEND_URL=
```

### 3. Run Backend

```bash
cd backend
npm run dev
```

### 4. Frontend Enviroment Setup

```env
NEXT_PUBLIC_BACKEND_URL=
```

### 5. Run Frontend

```bash
cd frontend
npm run dev
```

## 🔑 API Reference

For the complete API reference, see the [Developer Docs](https://spay-docs.vercel.app).

**IMPORTANT**

When creating charges:

Use the Authorization header instead of custom headers:

Authorization: Bearer <apiKey>:<apiSecret>

Every request should also include an Idempotency-Key header to prevent duplicate charges on retries:

Idempotency-Key: <unique-uuid>

## 📡 Webhooks

Merchants can register a `webhook_url` + `webhook_secret`. Events are signed with HMAC and include additional headers for security and idempotency.

⚠️ Note: Charges created via the dashboard do not trigger webhook events. Only charges created via the API will emit webhooks.

### Webhook Headers

- `X-SBTC-Signature`: HMAC-SHA256 signature (`sha256=...`)
- `X-SBTC-Event-Id`: Unique event identifier for deduplication
- `X-SBTC-Event-Timestamp`: ISO timestamp for replay protection
- `X-SBTC-Event-Attempt`: Retry attempt number

### Webhook Verification

```javascript
import express from "express";
import crypto from "crypto";

const app = express();
// Use raw to preserve exact bytes for HMAC verification
app.use(express.raw({ type: "application/json" }));

const WEBHOOK_SECRET = "your-webhook-secret";
const processed = new Set(); // In prod, use Redis/DB with TTL

function verifyHmac(raw, sigHeader, secret) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!sigHeader || expected.length !== sigHeader.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
}

app.post("/webhook", (req, res) => {
  const raw = req.body;
  const sig = req.header("X-SBTC-Signature");
  const eventId = req.header("X-SBTC-Event-Id");
  const timestamp = req.header("X-SBTC-Event-Timestamp");

  // Verify signature
  if (!verifyHmac(raw, sig, WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  // Check for replay attacks (optional: 10 min window)
  if (Math.abs(Date.now() - Date.parse(timestamp)) > 10 * 60 * 1000) {
    return res.status(400).send("Request too old");
  }

  // Prevent duplicate processing
  if (processed.has(eventId)) {
    return res.status(200).send("Already processed");
  }

  const payload = JSON.parse(raw.toString("utf8"));
  console.log("Webhook received:", payload);

  // Process the webhook (fulfill order, etc.)
  processed.add(eventId);
  res.status(200).send("OK");
});
```

### Event Types

- `charge.completed`: Payment successfully received and confirmed

## 🔒 Security Notes

- Never expose your `apiSecret` and `apiKey` client-side.
- Webhooks must be verified with HMAC.
- Sessions/cookies are merchant-side; API uses key+secret.

## 📜 License

MIT – Open source for the Stacks community.

⚡ Built with ❤️ for sBTC on Stacks.
