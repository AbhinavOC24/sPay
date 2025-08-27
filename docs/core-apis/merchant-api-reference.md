# Merchant API Reference

Merchant APIs let you onboard, authenticate, and configure your account. These
endpoints are session-based — they set a connect.sid cookie after login, which
is required for dashboard-only endpoints.

---

### **POST /api/merchants/signup**

Create a new merchant account.

#### Request

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/api/merchants/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coffee Shop",
    "email": "owner@example.com",
    "password": "super-secret"
  }'
```

#### Response

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

> ⚠️ **Note**: Store your `apiSecret` securely. It is required for **authentication when creating charges**.

---

### **POST /api/merchants/login**

Authenticate an existing merchant.\
Sets a `connect.sid` cookie for dashboard endpoints.

#### Request

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/api/merchants/login \
  -H "Content-Type: application/json" \
  -c cookie.txt \
  -d '{
    "email": "owner@example.com",
    "password": "super-secret"
  }'
```

#### Response

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

---

### **PUT /api/merchants/config**

Update merchant settings like payout address and webhook configuration.\
Requires login (`connect.sid` cookie).

#### Request

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

#### Response

```json
{
  "id": "merch_123",
  "payoutStxAddress": "STX123...",
  "webhookUrl": "https://merchant.com/webhook",
  "webhookSecret": "whsec_123..."
}
```

---

### **POST /api/merchants/logout**

Destroy the session and clear cookies.

#### Request

```bash
curl -X POST https://stacks-gateway-backend.onrender.com/api/merchants/logout \
  -b cookie.txt
```

#### Response

```json
{ "message": "Logged out successfully" }
```

---

### **GET /api/merchants/me**

Return details of the authenticated merchant.\
Requires login (`connect.sid` cookie).

#### Request

```bash
curl -X GET https://stacks-gateway-backend.onrender.com/api/merchants/me \
  -b cookie.txt
```

#### Response

```json
{
  "id": "merch_123",
  "name": "Coffee Shop",
  "email": "owner@example.com",
  "apiKey": "pk_live_abc",
  "apiSecret": "sk_live_xyz",
  "payoutStxAddress": "STX123...",
  "webhookSecret": "whsec_123...",
  "webhookUrl": "https://merchant.com/webhook"
}
```

---

### **GET /api/merchants/charges**

List all charges created by the merchant (dashboard view).\
Requires login (`connect.sid` cookie).

#### Request

```bash
curl -X GET https://stacks-gateway-backend.onrender.com/api/merchants/charges \
  -b cookie.txt
```

#### Response

```json
{
  "charges": [
    {
      "chargeId": "8a1e20b2-...",
      "amountSbtc": 0.002,
      "amountUsd": 90.12,
      "status": "COMPLETED",
      "createdAt": "2025-08-18T17:40:00Z",
      "paidAt": "2025-08-18T17:45:00Z",
      "payoutTxId": "0xabc123...",
      "failureReason": null
    }
  ]
}
```
