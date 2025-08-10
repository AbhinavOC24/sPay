"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverChargeConfirmedWebhook = deliverChargeConfirmedWebhook;
const prisma_client_1 = require("./prisma-client");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
// Send a webhook to the merchant with retries and signature verification
function deliverChargeConfirmedWebhook(_a) {
    return __awaiter(this, arguments, void 0, function* ({ payload, config, }) {
        const eventEnvelope = {
            type: "charge.confirmed",
            data: payload,
        };
        const bodyJson = JSON.stringify(eventEnvelope);
        if (!config.secret || !config.url) {
            console.log("Cant find webhook secret and url from deliverChargeWebhook");
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
                yield axios_1.default.post(config.url, bodyJson, {
                    headers: {
                        "Content-Type": "application/json",
                        "x-sbtc-signature": signature,
                        "x-sbtc-event-id": payload.chargeId,
                    },
                    timeout: 5000,
                });
                yield prisma_client_1.prisma.charge.update({
                    where: { chargeId: payload.chargeId },
                    data: {
                        webhookAttempts: { increment: 1 },
                        webhookLastStatus: "SUCCESS",
                    },
                });
                return;
            }
            catch (error) {
                console.error(`Webhook attempt ${attempts + 1} failed for ${payload.chargeId}:`, error);
                attempts++;
                yield prisma_client_1.prisma.charge.update({
                    where: { chargeId: payload.chargeId },
                    data: {
                        webhookAttempts: { increment: 1 },
                        webhookLastStatus: "FAILED",
                    },
                });
                if (attempts < maxAttempts) {
                    yield new Promise((res) => setTimeout(res, 2000)); // backoff
                }
            }
        }
    });
}
//# sourceMappingURL=deliverChargeWebhook.js.map