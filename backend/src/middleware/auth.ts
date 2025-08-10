// middleware/auth.ts
import { prisma } from "../utils/prisma-client";
import { Request, Response, NextFunction } from "express";

export async function requireMerchant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.header("x-api-key");
  if (!apiKey) return res.status(401).json({ error: "Missing X-API-Key" });

  const merchant = await prisma.merchant.findUnique({
    where: { apiKey },
    select: {
      id: true,
      name: true,
      email: true,
      apiKey: true,
      apiSecret: true,
      webhookUrl: true,
      webhookSecret: true,
      payoutStxAddress: true,
    },
  });
  if (!merchant) return res.status(401).json({ error: "Invalid API key" });

  (req as any).merchant = merchant; // attach to request
  next();
}
