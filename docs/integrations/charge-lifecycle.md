# Charge Lifecycle

Every charge created goes through a finite state machine managed by your
chargeProcessor. This ensures payments are processed exactly once, webhooks
are delivered reliably, and stuck charges don’t han

---

### State Machine Flow

```
 PENDING ──(payment seen on-chain)──▶ CONFIRMED
   │                                       │
   │ (cancel req / expiry)                 │
   └──────────────▶ CANCELLED              │
                                            │
                                            ▼
                              PAYOUT_INITIATED ──(tx fail)──▶ FAILED
                                            │
                                            │ (tx broadcast success)
                                            ▼
                                    PAYOUT_CONFIRMED
                                            │
                                            ▼
                                       COMPLETED
```

---

### 🟢 States Explained

#### 1. **PENDING**

- **How it gets here**:\
  Created via `/api/charge` (awaiting customer to pay sBTC).
- **What happens**:
  - Temp wallet address generated.
  - Charge expires in 15 min (TTL).
- **Exits**:
  - → **CONFIRMED** when payment detected on-chain.
  - → **CANCELLED** if merchant cancels manually OR TTL expires.

> ⚠️ **Note:** Charges expire in 15 minutes (configurable) — once expired, address is no longer valid for payment.

---

#### 2. **CONFIRMED**

- **How it gets here**:\
  `chargeProcessor` sees inbound sBTC transfer into temp wallet.
- **What happens**:
  - Status updated.
  - Webhook fired: `charge.confirmed`. (signed with your `webhookSecret`).
- **Exits**:
  - → **PAYOUT_INITIATED** when payout flow begins.

---

#### 3. **PAYOUT_INITIATED**

- **How it gets here**:\
  Processor attempts to sweep funds from temp wallet → merchant’s payout address.
- **What happens**:
  - Broadcasts Stacks tx (`transferSbtc`).
  - Logs `payoutTxId` in DB.
- **Exits**:
  - → **FAILED** if tx broadcast/rejected.
  - → **PAYOUT_CONFIRMED** if tx accepted.

---

#### 4. **PAYOUT_CONFIRMED**

- **How it gets here**:\
  Blockchain confirms the payout tx.
- **What happens**:
  - Webhook fired: `charge.completed`.
  - Charge marked stable.
- **Exits**:
  - → **COMPLETED** after final DB + webhook ack.

---

#### 5. **COMPLETED**

- **Final State.**
- Charge successfully processed + payout delivered.
- No further transitions.

> ⚠️ **Note:** Duplicate webhook events may still arrive (idempotency required).

---

#### 6. **CANCELLED**

- **How it gets here**:
  - Merchant cancels via `/charges/:id/cancel`.
  - Or TTL expires before payment.
- **Terminal state.**

> ⚠️ **Note:** If a customer later tries to pay, funds will still land in the temp wallet but won’t trigger processing.

---

#### 7. **FAILED**

- **How it gets here**:
  - Payout tx couldn’t be broadcast.
  - Funds stuck/unrecoverable.
- **Possible recovery**:
  - `recoverStuckCharges` tries to retry/recover.
- **Terminal (unless manually retried).**

---

### 📧 Webhook Trigger

- **COMPLETED** → `charge.completed`

```
{
"type": "charge.completed",
"eventId": "8a1e20b2-...:payout_completed",
"occurredAt": "2025-08-18T17:45:00Z",
"data": {
"chargeId": "8a1e20b2-...",
"amount": 0.002,
"payoutTxId": "0xabc123...",
"status": "COMPLETED"
}


```

- **EventId** is globally unique → use it for **idempotency** on your side.
- **Signature:** Each payload is signed with your `webhookSecret` (`X-SBTC-Signature`).
- **Retries:** Up to **3 attempts**, exponential backoff (2s → 4s → 6s).

---

**⚠️ Common Pitfalls**

- Customer pays after TTL expired → funds land, but charge stays `CANCELLED`.
- Merchant ignores retries → may miss `charge.completed` ack.
- Duplicate webhook delivery → must dedupe by `eventId`.
- Merchant server not handling raw body in HMAC check → signature fails.

---
