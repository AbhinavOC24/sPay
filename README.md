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

## 🔄 Payment Pipeline

The lifecycle of a charge looks like this:

```text
Customer
   │
   ▼
Ephemeral (Temp) Wallet ← (funded with STX gas fees by Master Wallet)
   │
   ▼
Merchant Payout Wallet (sBTC forwarded)
   │
   ▼
Webhook Delivery (if configured)
```

## Note on Wallet Funding

For each charge, the master wallet pre-funds the temporary wallet with a small amount of STX.
This STX is required to pay gas fees when transferring received sBTC from the temp wallet to the merchant’s payout wallet.

If the customer completes the payment, the temp wallet forwards the sBTC to the merchant’s payout address (using the funded STX for fees).

If the customer cancels or the charge expires, the pre-funded STX is automatically refunded back to the master wallet.

This ensures merchants always receive their full sBTC amount without needing to manage gas or fee balances themselves.

### 🔐 Advantages of Using Temporary (Ephemeral) Wallets

- **Per-charge isolation** – each customer payment uses its own wallet, minimizing blast radius if compromised.  
- **No merchant exposure** – merchants never need to expose or share their payout wallet in checkout flows.  
- **Cleaner accounting** – easy to track and reconcile charges, since each wallet maps 1:1 with a payment session.  
- **Automatic sweep** – funds are forwarded to the merchant payout wallet once confirmed, keeping temp wallets empty long term.  
- **Improved security posture** – reduces the chance of replay or double-spend attacks against a merchant’s main wallet.  

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
- **Infra**: Frontend currently uses polling until SSE is hooked up;SSE backend endpoints are ready;
- **Security**: HMAC webhook signing, API key + secret auth

## 📂 Project Structure

```
src
├── controller
│   ├── charge.controller.ts
│   └── merchant.controller.ts
├── db
│   └── index.ts
├── express.d.ts
├── index.ts
├── middleware
│   └── auth.ts
├── mock-webhook-server.ts
├── routes
│   ├── charge.routes.ts
│   └── merchant.routes.ts
├── types
│   └── types.ts
├── utils
│   ├── blockchain
│   │   ├── checksBTC.ts            # Validate sBTC transactions
│   │   ├── checkTxStatus.ts        # Poll blockchain for tx status
│   │   ├── deriveHotWallet.ts      # Derive hot/ephemeral wallets
│   │   ├── fetchUsdExchangeRate.ts # Fetch BTC/USD exchange rate
│   │   ├── refundCharge.ts         # Refund customer transactions
│   │   ├── transferSbtc.ts         # Perform sBTC transfers
│   │   └── transferStx.ts          # Perform STX transfers (gas/refunds)
│   │
│   ├── dbChecker
│   │   └── dbChecker.ts            # DB health monitoring + safe ops
│   │
│   ├── eventBus.ts                 # Pub/Sub system (SSE backend ready; Frontend implements polling)
│   ├── keys.ts                     # API key + secret generators
│   │
│   └── payment
│       ├── chargeProcessor.ts         # Core state machine orchestrator
│       ├── chargeProcessorComponents  # Modular pipeline steps
│       │   ├── expireOldCharges.ts      # Expire charges after TTL
│       │   ├── processNewPayments.ts    # Detect & verify new payments PENDING->CONFIRMED
│       │   ├── processPayoutInitiated.ts# Mark payouts as initiated    CONFIRMED->PAYOUT_INITIATED
│       │   ├── processPayoutConfirmed.ts# Confirm payout completion    PAYOUT_INITIATED->PAYOUT_CONFIRMED->COMPLETED
│       │   ├── recoverStuckCharges.ts   # Recover stuck charges        FOR REFUNDS AND OTHER RETRIALS
│       │   └── retryFailedWebhooks.ts   # Retry undelivered webhooks      
│       ├── deliverChargeWebhook.ts     # Deliver webhooks to merchants
│       ├── feeCalculator.ts            # Compute tx fees + buffers
│       ├── markChargeFailed.ts         # Mark charge as failed
│       ├── publicPayloadBuilder.ts     # Build payloads (SSE/webhooks)
│       └── publishChargeUpdate.ts      # Publish updates → eventBus/SSE
└── zod
    └── zodCheck.ts

```

### ⚙️ Charge Processor  

sPay runs a background **charge processor** service that polls the database every ~30 seconds.  

- ⏱ **Interval** – runs continuously on a 30s cycle (with backoff + retries).  
- 🔄 **State machine** – moves charges through their lifecycle:  
  - PENDING → CONFIRMED (payment detected)  
  - CONFIRMED → PAYOUT_INITIATED (payout tx broadcast)  
  - PAYOUT_INITIATED → PAYOUT_CONFIRMED (tx confirmed on-chain)  
  - PAYOUT_CONFIRMED → COMPLETED (webhook delivered + finalized)  
- 🧰 **Error handling** – retries on failures, marks charges as FAILED if unrecoverable.  
- 🩺 **DB resilience** – if the database restarts or loses connection, the processor automatically attempts recovery.  
- 🔧 **Stuck charge recovery** – detects and re-broadcasts stuck or timed-out payouts.  

👉 This ensures charges are always reconciled automatically, even if network issues or temporary errors occur.  

## ⚡ Quickstart

### 1. Clone & Install

```bash
git clone git@github.com:AbhinavOC24/sPay.git
cd backend
npm install
cd ../frontend
npm install
```

### 2. Backend Environment Setup

```env
# ---------------------------
# Server
# ---------------------------
BACKEND_PORT=8000
NODE_ENV=development

BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# ---------------------------
# Database (Supabase)
# ---------------------------

# Connection pooling (PGBouncer)
DATABASE_URL="postgresql://username:password@host:6543/dbname?pgbouncer=true"

# Direct connection (used for migrations)
DIRECT_URL="postgresql://username:password@host:5432/dbname?connection_limit=12&pool_timeout=30&connect_timeout=10&sslmode=require"

# ---------------------------
# Security
# ---------------------------
JWT_SECRET=your_jwt_secret_here

# ---------------------------
# Wallets
# ---------------------------

# Master Wallet
mnemonicString="your twelve or twenty-four word seed phrase goes here"

# Wallet generation
password=your_wallet_password_here

# ---------------------------
# Charge Recovery / Lifecycle (Default values mentioned unless changed)
# ---------------------------
RECOVERY_STUCK_THRESHOLD_MS=300000   # 5 minutes
MAX_LIFETIME_MS=1800000              # 30 minutes
LOOP_DELAY_MS=200
BATCH_SIZE=10
ALLOW_REFUND=true
FORCE_COMPLETE_WEBHOOKS=true
LOG_LEVEL=info

# ---------------------------
# Polling Intervals (Default values mentioned unless changed)
# ---------------------------
POLL_INTERVAL_MS=10000      # 10s
RECOVERY_INTERVAL_MS=1800000 # 30m

# ---------------------------
# Charge TTL
# ---------------------------
CHARGE_TTL_MIN=15
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
- Sessions/cookies are merchant-side; Charge related APIs uses key+secret and unique Idempotency key as header per charge to avoid charges.

## 📜 License

MIT – Open source for the Stacks community.

⚡ Built with ❤️ for sBTC on Stacks.
