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

router.put("/config", checkDashBoardAuth, updateConfig);
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", checkDashBoardAuth, me);
router.get("/charges", checkDashBoardAuth, listCharges);

export default router;
