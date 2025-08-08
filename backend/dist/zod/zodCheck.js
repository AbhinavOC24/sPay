"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentSchema = void 0;
const zod_1 = __importDefault(require("zod"));
exports.paymentSchema = zod_1.default.object({
    amount: zod_1.default.number().gt(0, { message: "number should be greater than 0" }),
    order_id: zod_1.default.string(),
    description: zod_1.default.string(),
    webhook_url: zod_1.default.string(),
});
//# sourceMappingURL=zodCheck.js.map