import type { Merchant } from "@prisma/client";

import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant;
    }
  }
}

import "express-session";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    merchantId?: string;
  }
}
