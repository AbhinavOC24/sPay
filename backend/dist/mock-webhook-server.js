"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// merchant mock: server.js
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const app = (0, express_1.default)();
// Use raw to preserve exact bytes for HMAC verification
app.use(express_1.default.raw({ type: "application/json" }));
const WEBHOOK_SECRET = "thisiswebhooksecret";
// In prod, replace with Redis/DB with TTL ~24h
const processed = new Set();
function verifyHmac(raw, sigHeader, secret) {
    const expected = "sha256=" + crypto_1.default.createHmac("sha256", secret).update(raw).digest("hex");
    if (!sigHeader || expected.length !== sigHeader.length)
        return false;
    return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
}
app.post("/webhook", (req, res) => {
    var _a;
    const raw = req.body;
    const sig = req.header("X-SBTC-Signature") || "";
    const eventId = req.header("X-SBTC-Event-Id") || "";
    const ts = req.header("X-SBTC-Event-Timestamp") || "";
    if (!eventId) {
        res.status(400).send("missing event id");
        return;
    }
    const calcBodySha = crypto_1.default.createHash("sha256").update(raw).digest("hex");
    const ok = verifyHmac(raw, sig, WEBHOOK_SECRET);
    if (!ok) {
        res.status(401).send("bad signature");
        return;
    }
    // Optional replay window (10 min)
    // if (Math.abs(Date.now() - Date.parse(ts)) > 10 * 60 * 1000) {
    //   return res.status(400).send("stale");
    // }
    if (processed.has(eventId)) {
        console.log(`📩 duplicate event ${eventId} ignored`);
        res.status(200).send("duplicate ignored");
        return;
    }
    const payload = JSON.parse(raw.toString("utf8"));
    console.log("📩 Webhook received:", {
        eventId,
        type: payload.type,
        chargeId: (_a = payload.data) === null || _a === void 0 ? void 0 : _a.chargeId,
    });
    // …process once (fulfill order/credit account/etc)…
    processed.add(eventId);
    res.status(200).send("ok");
    return;
});
app.listen(5001, () => {
    console.log("Mock webhook server on http://localhost:5001/webhook");
});
//# sourceMappingURL=mock-webhook-server.js.map