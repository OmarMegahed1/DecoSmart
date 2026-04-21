import "./db/config"; // load dotenv first
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./db/config";
import { errorHandler, notFound } from "./middleware/error";

// Routes
import authRouter from "./routes/auth";
import uploadRouter from "./routes/upload";
import generateRouter from "./routes/generate";
import operationsRouter from "./routes/operations";
import worldsRouter from "./routes/worlds";
import projectsRouter from "./routes/projects";
const sdRouter = require("./routes/sd").default;

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max 10 generations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Generation limit reached. Please wait before generating again." },
});

app.use(globalLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/generate", generateLimiter, generateRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/worlds", worldsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/sd", sdRouter);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`🚀 Decor AI backend running on http://localhost:${config.port}`);
  console.log(`   ENV: ${config.nodeEnv}`);
  console.log(`   CORS: ${config.corsOrigins.join(", ")}`);
});

export default app;
