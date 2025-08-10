import { prisma } from "./prisma-client";
import axios from "axios";
import * as crypto from "crypto";
import { WebhookDeliveryParams } from "../types/types";

// Send a webhook to the merchant with retries and signature verification
export async function deliverChargeConfirmedWebhook({
  payload,
  config,
}: WebhookDeliveryParams) {
  const eventEnvelope = {
    type: "charge.confirmed",
    data: payload,
  };
  const bodyJson = JSON.stringify(eventEnvelope);

  if (!config.secret || !config.url) {
    console.log(
      "📧 Can't find webhook secret and url from deliverChargeWebhook"
    );
    return;
  }

  // Generate HMAC signature
  const signature = crypto
    .createHmac("sha256", config.secret)
    .update(bodyJson)
    .digest("hex");

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
          "x-sbtc-signature": signature,
          "x-sbtc-event-id": payload.chargeId,
        },
        timeout: 5000,
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
      return;
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
}
