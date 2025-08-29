import express from "express";
import dotenv from "dotenv";
import path from "path";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";

import {
  recoverStuckCharges,
  retryFailedWebhooks,
  startChargeProcessor,
} from "./utils/payment/chargeProcessor";
import merchantRoutes from "./routes/merchant.routes";
import chargeRoutes from "./routes/charge.routes";
import { checkoutPage } from "./controller/charge.controller";
import router from "./routes/charge.routes";

const app = express();

app.set("trust proxy", 1);
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "public")));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
dotenv.config();

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL, // or user/pass/host/db separately
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool: pgPool, // connection pool
      tableName: "session", // you can override the table name (default is "session")
      createTableIfMissing: true, // 👈 auto-creates session table
    }),
    secret: process.env.FOO_COOKIE_SECRET || "123123123",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production", // cookie over https only in prod
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
    },
  })
);

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

app.use("/merchants", merchantRoutes);

app.use("/charges", chargeRoutes);

app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

app.listen(process.env.BACKEND_PORT, () => {
  console.log(`listening on port ${process.env.BACKEND_PORT}`);

  startChargeProcessor();
  setInterval(() => retryFailedWebhooks(), 60_000);

  setInterval(() => recoverStuckCharges(), 5 * 60_000);
});
