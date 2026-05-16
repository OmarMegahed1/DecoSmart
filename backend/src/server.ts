import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env, isTestEnv } from "./env";
import { errorHandler } from "./middleware/errorHandler";
import { createApiRouter } from "./routes/apiRouter";

import authRouter from "./routes/authRoutes";
import { resetMobileBridgeHandler } from "./controllers/resetBridgeController";
import { verifyEmailMobileBridgeHandler } from "./controllers/verifyEmailBridgeController";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    })
  );

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  app.use(globalLimiter);

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    morgan("dev", {
      skip: () => isTestEnv(),
    })
  );

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "Decor AI API",
    });
  });

  /** HTTPS landing page from password-reset email → forwards to native app (`MOBILE_APP_SCHEME`). */
  app.get("/reset-mobile-bridge", resetMobileBridgeHandler);

  /** After `/auth/verify-email` — same pattern as reset bridge for mail-client compatibility. */
  app.get("/verify-email-mobile-bridge", verifyEmailMobileBridgeHandler);

  app.use("/auth", authRouter);
  app.use("/api", createApiRouter());

  app.use((req, res) => {
    res.status(404).json({
      error: "Route not found",
      path: req.originalUrl,
    });
  });

  app.use(errorHandler);

  return app;
}
