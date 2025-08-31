import prisma from "../../db";
import axios from "axios";
import * as crypto from "crypto";
import { WebhookDeliveryParams } from "../../types/types";

export async function deliverChargeConfirmedWebhook({
  payload,
  config,
}: WebhookDeliveryParams) {
  if (!config.secret || !config.url) {
    // Ensure merchant has configured a webhook URL + secret

    console.log(
      "📧 Can't find webhook secret and url from deliverChargeWebhook"
    );
    return;
  }
  // Unique event ID and timestamp

  const eventId = `${payload.chargeId}:payout_completed`;
  const nowIso = new Date().toISOString();

  // Wrap payload in a consistent event envelope

  const eventEnvelope = {
    type: "charge.completed",
    eventId,
    occurredAt: nowIso,
    data: payload,
  };

  // Serialize to JSON and sign with HMAC-SHA256 using webhook secret

  const bodyJson = JSON.stringify(eventEnvelope);
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", config.secret).update(bodyJson).digest("hex");

  // Retry config

  let attempts = 0;
  const maxAttempts = 3;

  // Try delivering webhook up to `maxAttempts` times

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
          "X-SBTC-Signature": signature,
          "X-SBTC-Event-Id": eventId,
          "X-SBTC-Event-Attempt": String(attempts),
          "X-SBTC-Event-Timestamp": nowIso,
        },
        timeout: 8000,
      });

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

      // Record failure in DB
      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "FAILED",
          lastProcessedAt: new Date(),
        },
      });

      // Backoff before retry (linear: 2s, 4s, 6s)

      if (attempts < maxAttempts) {
        const backoffDelay = attempts * 2000;
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

export async function deliverChargeCancelledWebhook({
  payload,
  config,
}: WebhookDeliveryParams) {
  if (!config.secret || !config.url) {
    console.log(
      "📧 Can't find webhook secret and url from deliverChargeCancelledWebhook"
    );
    return;
  }
  console.log("paylord", payload, config);
  const eventId = `${payload.chargeId}:cancelled`;
  const nowIso = new Date().toISOString();

  const eventEnvelope = {
    type: "charge.cancelled", // 👈 distinct type
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
        `📧 Sending CANCEL webhook attempt ${attempts + 1} for charge ${
          payload.chargeId
        }`
      );
      console.log("inside cancel charge webhook");
      await axios.post(config.url, bodyJson, {
        headers: {
          "Content-Type": "application/json",
          "X-SBTC-Signature": signature,
          "X-SBTC-Event-Id": eventId,
          "X-SBTC-Event-Attempt": String(attempts),
          "X-SBTC-Event-Timestamp": nowIso,
        },
        timeout: 8000,
      });

      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "SUCCESS",
          lastProcessedAt: new Date(),
        },
      });

      console.log(
        `📧 ✅ CANCEL webhook delivered successfully for ${payload.chargeId}`
      );
      return true;
    } catch (error: any) {
      attempts++;

      console.error(
        `📧 ❌ CANCEL webhook attempt ${attempts} failed for ${payload.chargeId}:`,
        error?.response?.status || error?.code || error?.message
      );

      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "FAILED",
          lastProcessedAt: new Date(),
        },
      });

      if (attempts < maxAttempts) {
        const backoffDelay = attempts * 2000;
        console.log(`📧 ⏳ Retrying CANCEL webhook in ${backoffDelay}ms...`);
        await new Promise((res) => setTimeout(res, backoffDelay));
      }
    }
  }

  console.error(
    `📧 💀 All CANCEL webhook attempts failed for ${payload.chargeId}`
  );
  return false;
}
