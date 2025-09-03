import { Router } from "express";

import {
  cancelCharge,
  chargeEvents,
  chargeQr,
  getCharge,
} from "../controller/charge.controller";
import { requireMerchant } from "../middleware/auth";
import { createCharge } from "../controller/charge.controller";

const router = Router();

router.get("/:id", getCharge);
// router.get("/:id/events", chargeEvents);
router.get("/:id/qr.png", chargeQr);

router.post("/:id/cancel", cancelCharge);
router.post("/createCharge", requireMerchant, createCharge);

export default router;
