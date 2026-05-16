import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { generationCreateLimiter } from "../middleware/rateLimits";
import { generateBodySchema } from "../validation/generations";
import { listGenerations, postGenerate } from "../controllers/generationsController";

/**
 * Resource: generations (WorldLabs jobs for the current user).
 * - GET / — list generation history for the current user.
 * - POST / — start a new generation (rate-limited).
 */
const router = Router();

router.use(requireAuth);

router.get("/", listGenerations);

router.post(
  "/",
  generationCreateLimiter,
  validateBody(generateBodySchema),
  postGenerate
);

export default router;
