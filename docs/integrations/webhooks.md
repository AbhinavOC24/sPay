# Webhooks

Webhooks let your server get real-time notifications when a charge’s status
changes (e.g. charge.confirmed, charge.completed). The gateway delivers
webhook events via POST requests to the URL you con

The gateway delivers webhook events via `POST` requests to the **Webhook URL** you configured in `/api/merchants/config`.

This is also where the **webhookSecret** you set comes into play — it’s used by the gateway to generate the `X-SBTC-Signature` header, and by your server to verify authenticity.

---

### Delivery

- Events are sent as JSON payloads with the following structure:

```json
{
  "type": "charge.completed",
  "eventId": "8a1e20b2-...:payout_completed",
  "occurredAt": "2025-08-18T17:55:00Z",
  "data": {
    "chargeId": "8a1e20b2-...",
    "amount": "200000",
    "status": "COMPLETED",
    "payoutTxId": "0xabc123..."
  }
}
```

- Headers included with every webhook:

| Header                   | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `X-SBTC-Signature`       | HMAC SHA256 of the raw JSON body, signed with your `webhookSecret`.      |
| `X-SBTC-Event-Id`        | Unique event ID (stable across retries). Use to de-dupe.                 |
| `X-SBTC-Event-Attempt`   | Retry attempt number (0, 1, 2...).                                       |
| `X-SBTC-Event-Timestamp` | ISO timestamp when the event was generated. Reject if too old (>10 min). |

- Retries: if your server does not return **200 OK** within 8 seconds, the gateway retries up to 3 times with exponential backoff (2s, 4s, 6s).
- Idempotency: You may receive duplicate events. Always check `eventId` and ignore if already processed.

---

### Verifying the Signature

You must verify the `X-SBTC-Signature` header to ensure the event is genuine.

#### Example (Node.js / Express)

```ts
import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.raw({ type: "application/json" }));

const WEBHOOK_SECRET = "whsec_123..."; // from dashboard

function verifyHmac(raw: Buffer, sigHeader: string, secret: string) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return (
    sigHeader &&
    expected.length === sigHeader.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader))
  );
}

app.post("/webhook", (req, res) => {
  const raw = req.body as Buffer;
  const sig = req.header("X-SBTC-Signature") || "";
  const eventId = req.header("X-SBTC-Event-Id") || "";
  const ts = req.header("X-SBTC-Event-Timestamp") || "";

  if (!verifyHmac(raw, sig, WEBHOOK_SECRET)) {
    return res.status(401).send("bad signature");
  }

  // Optional replay protection (10 min window)
  if (Math.abs(Date.now() - Date.parse(ts)) > 10 * 60 * 1000) {
    return res.status(400).send("stale");
  }

  // Deduplicate by eventId
  // (store in DB/Redis; example just uses memory)
  console.log("📩 Webhook received:", raw.toString("utf8"));

  res.status(200).send("ok");
});

app.listen(5001, () =>
  console.log("Listening for webhooks on http://localhost:5001/webhook")
);
```

---

### Example Event Types

- `charge.confirmed` → Payment detected and confirmed on chain.
- `charge.completed` → Payout to merchant address completed.
- Future: `charge.failed`, `charge.expired`.

---

### Common Errors

- If your server returns non-200: event is retried (up to 3 times).
- If signature does not match: you’ll get `401 bad signature`.
- If request timestamp is too old (>10 minutes): reject with `400 stale`.
- If duplicate event ID: ignore and return `200 OK`.

---
