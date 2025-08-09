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

  // Generate HMAC signature
  const signature = crypto
    .createHmac("sha256", config.secret)
    .update(bodyJson)
    .digest("hex");

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      await axios.post(config.url, bodyJson, {
        headers: {
          "Content-Type": "application/json",
          "x-sbtc-signature": signature,
          "x-sbtc-event-id": payload.chargeId,
        },
        timeout: 5000,
      });

      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "SUCCESS",
        },
      });

      return;
    } catch (error) {
      console.error(
        `Webhook attempt ${attempts + 1} failed for ${payload.chargeId}:`,
        error
      );

      attempts++;
      await prisma.charge.update({
        where: { chargeId: payload.chargeId },
        data: {
          webhookAttempts: { increment: 1 },
          webhookLastStatus: "FAILED",
        },
      });

      if (attempts < maxAttempts) {
        await new Promise((res) => setTimeout(res, 2000)); // backoff
      }
    }
  }
}
