import prisma from "../../db";
import axios from "axios";
import * as crypto from "crypto";
import { WebhookDeliveryParams } from "../../types/types";

// Send a webhook to the merchant with retries and signature verification
export async function deliverChargeConfirmedWebhook({
  payload,
  config,
}: WebhookDeliveryParams) {
  if (!config.secret || !config.url) {
    console.log(
      "📧 Can't find webhook secret and url from deliverChargeWebhook"
    );
    return;
  }
  // Stable per logical event (do NOT change across retries)
  const eventId = `${payload.chargeId}:payout_completed`;
  const nowIso = new Date().toISOString();

  // Generate HMAC signature
  const eventEnvelope = {
    type: "charge.completed",
    eventId,
    occurredAt: nowIso,
    data: payload,
  };
  const bodyJson = JSON.stringify(eventEnvelope);
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", config.secret).update(bodyJson).digest("hex");

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      console.log(
        `📧 Sending webhook attempt ${attempts + 1} for charge ${
          payload.chargeId
        }`
      );

      await axios.post(config.url, bodyJson, {
        headers: {
          "Content-Type": "application/json",
          "X-SBTC-Signature": signature, // HMAC of raw body
          "X-SBTC-Event-Id": eventId, // idem key for receiver
          "X-SBTC-Event-Attempt": String(attempts),
          "X-SBTC-Event-Timestamp": nowIso,
        },
        timeout: 8000,
      });

      // Update webhook success status
      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "SUCCESS",
          lastProcessedAt: new Date(),
        },
      });

      console.log(
        `📧 ✅ Webhook delivered successfully for charge ${payload.chargeId}`
      );
      return true;
    } catch (error: any) {
      attempts++;

      console.error(
        `📧 ❌ Webhook attempt ${attempts} failed for ${payload.chargeId}:`,
        error?.response?.status || error?.code || error?.message
      );

      // Update webhook failure status
      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "FAILED",
          lastProcessedAt: new Date(),
        },
      });

      // If not the last attempt, wait before retrying
      if (attempts < maxAttempts) {
        const backoffDelay = attempts * 2000; // 2s, 4s, 6s
        console.log(`📧 ⏳ Retrying webhook in ${backoffDelay}ms...`);
        await new Promise((res) => setTimeout(res, backoffDelay));
      }
    }
  }

  console.error(
    `📧 💀 All webhook attempts failed for charge ${payload.chargeId}`
  );
  return false;
}
