import { Router } from "express";
import { checkDashBoardAuth } from "../middleware/auth";

import { requireMerchant } from "../middleware/auth";
import {
  createCharge,
  listCharges,
  login,
  logout,
  me,
  signup,
  updateConfig,
} from "../controller/merchant.controller";

const router = Router();

router.put("/merchants/config", checkDashBoardAuth, updateConfig);
router.post("/merchants/signup", signup);
router.post("/merchants/login", login);
router.post("/merchants/logout", logout);
router.get("/merchants/me", checkDashBoardAuth, me);
router.get("/merchants/charges", checkDashBoardAuth, listCharges);
// router.post("/charges/createCharge", requireMerchant, createCharge);

export default router;
