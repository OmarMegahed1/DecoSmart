import rateLimit from "express-rate-limit";

/** Applied only to POST /api/generations (start generation). */
export const generationCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Generation limit reached. Please wait before generating again." },
});
