# Payment API Reference

The Payments API lets you create, query, and manage charges. These endpoints
require authentication with your API key and secret, and support idempotency
to prevent duplicate charges.

---

### **POST /charges/createCharge** — Create Charge

Create a new sBTC payment request.

#### Headers

| Header            | Required | Description                                    |
| ----------------- | -------- | ---------------------------------------------- |
| `Authorization`   | ✅       | `Bearer <apiKey>:<apiSecret>`                  |
| `Idempotency-Key` | ✅       | Unique string per charge. Prevents duplicates. |

#### Request Body

Parameters:

- `amount` _(number, required)_ → Payment amount in **sBTC** (must be > 0).
- `order_id` _(string, required)_ → Your internal order reference.
- `success_url` _(string, optional)_ → Customer will be redirected here after a successful payment.
- `cancel_url` _(string, optional)_ → Customer will be redirected here if the charge is cancelled.
- `webhookDelivery` _(boolean, optional)_ →
  - **`webhookDelivery: true` ** → The gateway automatically processes the charge and delivers webhook events (`charge.confirmed`, `charge.completed`).
  - **`webhookDelivery: false` (default)** → The charge is created and visible in the dashboard, but **no webhooks are fired automatically**.

> 💡 Set webhookDelivery: false if you want to skip automatic webhook delivery and handle fulfillment on your side. This is useful for invoices, offline settlements, or custom payout flows.

#### Request

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/charges/createCharge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc:sk_live_xyz" \
  -H "Idempotency-Key: unique-key-001" \
  -d '{
    "amount": 0.002,
    "order_id": "order-1001",
    "success_url": "https://merchant.com/success",
    "cancel_url": "https://merchant.com/cancel",
    "webhookDelivery": false
  }'
```

#### Success Response

```json
{
  "address": "ST3ABC...XYZ",
  "charge_id": "8a1e20b2-...",
  "paymentUrl": "https://<url>/checkout/8a1e20b2-..."
}
```

> ⚡ **Note on `chargeId`**\
> Every charge you create has a unique `chargeId`. Use it to query, cancel, or listen for events.

**Response Fields**

- `address` → Ephemeral deposit address for sBTC payment.
- `charge_id` → Unique charge identifier.
- `paymentUrl` → Hosted checkout link (QR code + live updates).

#### Error Cases

| Status | Error Code                | Example                                          | Meaning                                                                                 |
| ------ | ------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 400    | `missing_idempotency_key` | `{ "error": "missing_idempotency_key" }`         | You didn’t provide the `Idempotency-Key` header.                                        |
| 400    | Validation Error          | `{ "error": "number should be greater than 0" }` | Request body failed schema validation (e.g. `amount <= 0`).                             |
| 401    | `unauthorized`            | `{ "error": "unauthorized" }`                    | Missing or invalid authentication.                                                      |
| 401    | `invalid_credentials`     | `{ "error": "invalid_credentials" }`             | Wrong API key/secret.                                                                   |
| 200    | Duplicate                 | `{ "Error": "Duplicate charge" }`                | Same `Idempotency-Key` reused → original charge returned instead of creating a new one. |

---

### **GET /charges/:id** — Get Charge

Retrieve the latest snapshot of a charge.

#### Request

```bash
curl -X GET https://stacks-gateway-backend.onrender.com/charges/[chargeId]
```

#### Success Response

```json
{
  "chargeId": "8a1e20b2-...",
  "address": "ST3ABC...XYZ",
  "amount": 0.002,
  "status": "PENDING",
  "usdRate": 90.12,
  "order_id": "sneakerRed",
  "createdAt": "2025-08-18T17:40:00Z",
  "expiresAt": "2025-08-18T17:55:00Z",
  "success_url": "https://merchant.com/success",
  "cancel_url": "https://merchant.com/cancel"
}
```

#### Error Cases

| Status | Example                    | Meaning                |
| ------ | -------------------------- | ---------------------- |
| 404    | `{ "error": "Not found" }` | Charge does not exist. |

---

### **GET /charges/:id/events** — Charge Events (SSE)

Real-time updates via **Server-Sent Events**.

#### Request

```bash
curl -N https://stacks-gateway-backend.onrender.com/charges/[chargeId]/events
```

#### Event Example

```
event: charge.updated
data: {
  "chargeId": "8a1e20b2-...",
  "status": "CONFIRMED",
  "paidAt": "2025-08-18T17:45:00Z"
}
```

#### Error Cases

| Status | Event          | Meaning                                                   |
| ------ | -------------- | --------------------------------------------------------- |
| 404    | `charge.error` | Charge not found.                                         |
| 409    | `charge.error` | Connection closed due to invalid state or expired charge. |

---

### **GET /charges/:id/qr.png** — QR Code

Returns a **PNG QR code** encoding the payment request.

#### Request

```bash
curl -o qr.png https://stacks-gateway-backend.onrender.com/charges/[chargeId]/qr.png
```

#### Example Payload Encoded in QR

```json
{ "token": "sBTC", "to": "ST3ABC...XYZ", "amount": 200000 }
```

#### Error Cases

| Status | Example       | Meaning                |
| ------ | ------------- | ---------------------- |
| 404    | `"Not found"` | Charge does not exist. |

---

### **POST /charges/:id/cancel** — Cancel Charge

Cancel a charge that is still `PENDING`.

#### Request

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/charges/[chargeId]/cancel
```

#### Success Response

```json
{ "ok": true, "status": "CANCELLED" }
```

#### Error Cases

| Status | Example                                               | Meaning                                                        |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------- |
| 404    | `{ "error": "not_found" }`                            | No such charge exists.                                         |
| 409    | `{ "error": "cannot_cancel", "status": "COMPLETED" }` | Cannot cancel once charge is already confirmed/paid/completed. |
| 409    | `{ "error": "cannot_cancel", "status": "CANCELLED" }` | Already cancelled.                                             |

---

### **GET /health** — Health Check

Basic service check.

#### Request

```bash
curl https://stacks-gateway-backend.onrender.com/health
```

#### Success Response

```json
{ "ok": true, "time": "2025-08-18T18:00:00Z" }
```
