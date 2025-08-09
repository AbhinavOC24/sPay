// express.d.ts
import type { Merchant } from "@prisma/client";
// adjust to your correct path
import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant; // Add merchant to the Request type
    }
  }
}
