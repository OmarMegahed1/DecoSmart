import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./db/config";
import { errorHandler, notFound } from "./middleware/errorHandler";

import authRouter from "./routes/auth";
import uploadRouter from "./routes/upload";
import generateRouter from "./routes/generate";
import operationsRouter from "./routes/operations";
import worldsRouter from "./routes/worlds";
import projectsRouter from "./routes/projects";
import cadRouter from "./routes/cad";
import { resetMobileBridgeHandler } from "./routes/resetBridge";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
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

  const generateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Generation limit reached. Please wait before generating again." },
  });

  app.use(globalLimiter);

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  /** HTTPS landing page from password-reset email → forwards to native app (`MOBILE_APP_SCHEME`). */
  app.get("/reset-mobile-bridge", resetMobileBridgeHandler);

  app.use("/auth", authRouter);
  app.use("/api/upload", uploadRouter);
  app.use("/api/generate", generateLimiter, generateRouter);
  app.use("/api/operations", operationsRouter);
  app.use("/api/worlds", worldsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/cad", cadRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
