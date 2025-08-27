# Overview

The **sBTC Payment Gateway** lets merchants accept Bitcoin payments via sBTC on Stacks.\
Think of it as _Stripe for sBTC_: we handle wallet creation, transaction processing, and merchant payout — so you can focus on your business.

---

### How it Works

1. A **unique ephemeral wallet** is generated for each charge.
   - Each payment has a clean address.
   - Prevents address reuse → better privacy + accounting clarity.
2. The customer sends sBTC to this wallet.
3. The gateway confirms payment, then transfers funds to the merchant’s **payout wallet**.
4. The merchant is notified via **webhooks** and can track charges in the dashboard.

### Processing Pipeline

```
Customer → Ephemeral Wallet → Merchant Payout Wallet
```

This design:

- Isolates customer deposits from the hot wallet
- Makes every charge auditable, single-use, and secure

#### Why an Ephemeral Wallet?

Instead of paying merchants directly:

- **1 address = 1 charge** → easy mapping between blockchain txs and your records.
- Improved **traceability** + reconciliation.
- Limits risk by avoiding permanent address reuse.
