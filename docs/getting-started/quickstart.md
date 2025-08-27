# Quickstart

This guide walks you through creating your first sBTC payment. You can get
started using either the Merchant Dashboard (UI) or the API.

---

### 1. Sign Up / Log In as a Merchant

#### Option A: Dashboard (UI)

- Visit: [https://stacks-gateway.vercel.app/](https://stacks-gateway.vercel.app/)
- Sign up for a new merchant account or log in if you already have one.
- From the **Merchant Dashboard**, you can:
  - View your **API Key** and **API Secret**
  - Configure your **Webhook URL** and **Webhook Secret**
  - Set your **payout address**
  - View charges in real time

#### Option B: API

**Signup**

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/api/merchants/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coffee Shop",
    "email": "owner@example.com",
    "password": "super-secret"
  }'
```

Response:

```json
{
  "message": "Merchant account created successfully",
  "merchant": {
    "id": "merch_123",
    "name": "Coffee Shop",
    "email": "owner@example.com",
    "apiKey": "pk_live_abc",
    "apiSecret": "sk_live_xyz",
    "createdAt": "2025-08-18T17:30:00Z",
    "payoutStxAddress": null,
    "webhookSecret": null,
    "webhookUrl": null
  }
}
```

> ⚠️ **Note:** Store your `apiSecret` and `apiKey` securely. They are required for authentication when creating charges.

**Login**

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/api/merchants/login \
  -H "Content-Type: application/json" \
  -c cookie.txt \
  -d '{
    "email": "owner@example.com",
    "password": "super-secret"
  }'
```

Response:

```json
{
  "message": "Login successful",
  "merchant": {
    "id": "merch_123",
    "name": "Coffee Shop",
    "email": "owner@example.com",
    "apiKey": "pk_live_abc",
    "apiSecret": "sk_live_xyz",
    "payoutStxAddress": "STX123...",
    "webhookSecret": "whsec_123...",
    "webhookUrl": "https://merchant.com/webhook"
  }
}
```

> 💡 **Tip:** Logging in sets a session cookie (`connect.sid`). Use this cookie for dashboard-only endpoints like `/api/merchants/me`, `/api/merchants/config`, and `/api/merchants/charges`.

---

### 2. Configure Merchant Settings

Before creating charges, set up your:

- **payoutStxAddress** — where funds are settled
- **webhookUrl** — endpoint to receive events
- **webhookSecret** — used to verify event signatures

This can be done in the **Dashboard** or via API:

```bash
curl -X PUT https://stacks-gateway-backend.onrender.com/api/merchants/config \
  -H "Content-Type: application/json" \
  -b cookie.txt \
  -d '{
    "payoutStxAddress": "STX123...",
    "webhookUrl": "https://merchant.com/webhook",
    "webhookSecret": "whsec_123..."
  }'
```

⚠️ **Note:** Your `webhookSecret` must also be stored safely — it is required to verify webhook events.

---

### 3. Create a Charge

To create a charge, you need two headers:

1. **Authentication**

   - Required:

     ```http
     Authorization: Bearer <apiKey>:<apiSecret>
     ```

2. **Idempotency Key**&#x20;

   - Required:

     ```http
     Idempotency-Key: <unique-string>
     ```

   - Ensures the same request is **only processed once**.
   - The gateway stores `(merchantId + idempotencyKey)`. If you retry with the same key, you’ll receive the original charge instead of a duplicate.

---

#### Request Body

Parameters:

- `amount` _(number, required)_ → Payment amount in **sBTC** (must be > 0).
- `order_id` _(string, required)_ → Your internal order reference.
- `success_url` _(string, optional)_ → Customer will be redirected here after a successful payment.
- `cancel_url` _(string, optional)_ → Customer will be redirected here if the charge is cancelled.
- `manual` _(boolean, optional)_ →
  - **`manual: false` (default)** → Normal mode. The gateway automatically processes the charge and delivers webhook events (`charge.confirmed`, `charge.completed`).
  - **`manual: true`** → Manual mode. The charge is created and visible in the dashboard, but **no webhooks are fired automatically**.

> 💡 Set manual: true if you want to skip automatic webhook delivery and handle fulfillment on your side. This is useful for invoices, offline settlements, or custom payout flows.

```json
{
  "amount": 0.002,
  "order_id": "order-1001",
  "success_url": "https://merchant.com/success",
  "cancel_url": "https://merchant.com/cancel",
  "manual": false
}
```

#### Example (Preferred Auth + Idempotency)

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/api/charges/createCharge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_live_abc:sk_live_xyz" \
  -H "Idempotency-Key: order-1001" \
  -d '{
    "amount": 0.002,
    "order_id": "order-1001",
    "success_url": "https://merchant.com/success",
    "cancel_url": "https://merchant.com/cancel"
    "manual": false
  }'
```

Response:

```json
{
  "address": "ST3ABC...XYZ",
  "charge_id": "8a1e20b2-...",
  "paymentUrl": "https://<backend-url>/checkout/8a1e20b2-..."
}
```

> ⚡ **Note on `chargeId`**\
> Every charge you create has a unique `chargeId`. Use it to query, cancel, or listen for events. You’ll get this back in the response when creating a charge.

| Field          | Type         | Description                                                                                                           |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **address**    | string       | The **temporary sBTC address** where the customer must send the payment. Generated per charge.                        |
| **charge_id**  | string       | Unique identifier for the charge in the gateway. Use this for status checks, webhooks, and reconciliation.            |
| **paymentUrl** | string (URL) | Hosted checkout page URL. Redirect your customer here — it shows the QR code, payment instructions, and live updates. |

---

💡 **Best practice**:

- Show customers the hosted `paymentUrl` (not just the raw `address`), since it includes QR, timers, and live status.
- Use `charge_id` in your backend if you want to **track payment status** or correlate with your internal `order_id`.

#### ⚠️ Some common errors

| Condition                 | Response                                         |
| ------------------------- | ------------------------------------------------ |
| Missing idempotency key   | `{ "error": "missing_idempotency_key" }`         |
| Duplicate idempotency key | `{ "Error": "Duplicate charge" }`                |
| Invalid amount (<= 0)     | `{ "error": "number should be greater than 0" }` |
| Invalid credentials       | `{ "error": "invalid_credentials" }`             |

---

Redirect your customer to the returned `paymentUrl`.\
The hosted checkout page will:

- Show a QR code with the sBTC payment details
- Auto-update the charge status in real time
- Redirect to your `success_url` or `cancel_url` after completion
