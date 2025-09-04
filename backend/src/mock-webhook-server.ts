// merchant mock: server.js
import express from "express";
import crypto from "crypto";

const app = express();
// Use raw to preserve exact bytes for HMAC verification
app.use(express.raw({ type: "application/json" }));

const WEBHOOK_SECRET = "thisiswebhooksecret";
// In prod, replace with Redis/DB with TTL ~24h
const processed = new Set<string>();

function verifyHmac(
  raw: Buffer,
  sigHeader: string | undefined,
  secret: string
) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!sigHeader || expected.length !== sigHeader.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
}

app.post("/webhook", (req, res) => {
  const raw = req.body as Buffer;
  const sig = req.header("X-SBTC-Signature") || "";
  const eventId = req.header("X-SBTC-Event-Id") || "";
  const ts = req.header("X-SBTC-Event-Timestamp") || "";

  if (!eventId) {
    res.status(400).send("missing event id");
    return;
  }
  const calcBodySha = crypto.createHash("sha256").update(raw).digest("hex");

  const ok = verifyHmac(raw, sig, WEBHOOK_SECRET!);
  if (!ok) {
    res.status(401).send("bad signature");
    return;
  }

  // Optional replay window (10 min)
  if (Math.abs(Date.now() - Date.parse(ts)) > 10 * 60 * 1000) {
    return res.status(400).send("stale");
  }

  if (processed.has(eventId)) {
    res.status(200).send("duplicate ignored");
    return;
  }

  const payload = JSON.parse(raw.toString("utf8"));

  processed.add(eventId);
  res.status(200).send("ok");
  return;
});

app.listen(5001, () => {
  console.log("Mock webhook server on http://localhost:5001/webhook");
});
