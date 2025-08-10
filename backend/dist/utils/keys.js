"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.genApiKey = genApiKey;
exports.genApiSecret = genApiSecret;
exports.genWebhookSecret = genWebhookSecret;
const crypto_1 = __importDefault(require("crypto"));
function genApiKey() {
    return "sbtk_" + crypto_1.default.randomBytes(24).toString("hex");
}
function genApiSecret() {
    return "sk_" + crypto_1.default.randomBytes(32).toString("hex");
}
function genWebhookSecret() {
    return crypto_1.default.randomBytes(32).toString("hex");
}
//# sourceMappingURL=keys.js.map