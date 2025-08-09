"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.post("/webhook", (req, res) => {
    console.log("📩 Webhook received!");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    res.status(200).send("ok");
});
app.listen(5001, () => {
    console.log("Mock webhook server running on http://localhost:5001/webhook");
});
//# sourceMappingURL=mock-webhook-server.js.map