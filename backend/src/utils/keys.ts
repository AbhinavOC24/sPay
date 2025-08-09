import crypto from "crypto";

export function genApiKey() {
  return "sbtk_" + crypto.randomBytes(24).toString("hex");
}

export function genApiSecret() {
  return "sk_" + crypto.randomBytes(32).toString("hex");
}

export function genWebhookSecret() {
  return crypto.randomBytes(32).toString("hex");
}
