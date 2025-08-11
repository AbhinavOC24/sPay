// middleware/auth.ts
import prisma from "../db";
import { Request, Response, NextFunction } from "express";

export async function requireMerchant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Prefer Authorization: Bearer <apiKey>:<apiSecret>
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    const [apiKey, apiSecret] = token.split(":");
    if (!apiKey || !apiSecret) {
      return res.status(401).json({ error: "invalid_auth_format" });
    }

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
    if (!merchant || merchant.apiSecret !== apiSecret) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    (req as any).merchant = merchant;
    return next();
  }

  // Back-compat: allow x-api-key only (legacy)
  const apiKey = req.header("x-api-key");
  if (apiKey) {
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
    if (!merchant) return res.status(401).json({ error: "invalid_api_key" });
    (req as any).merchant = merchant;
    return next();
  }

  return res.status(401).json({ error: "missing_auth" });
}
