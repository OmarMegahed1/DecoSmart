import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateParams, validateQuery } from "../middleware/validation";
import { worldIdParamSchema } from "../validation/worlds";
import { spzParamsSchema, spzQuerySchema } from "../validation/spz";
import { getWorldDetail } from "../controllers/worldsController";
import { getWorldSpz } from "../controllers/spzController";

/**
 * Resource: worlds (WorldLabs world entities).
 * Static/nested segments before `/:worldId` to avoid greedy matching.
 */
const router = Router();

router.use(requireAuth);

router.get(
  "/:worldId/spz/:quality",
  validateParams(spzParamsSchema),
  validateQuery(spzQuerySchema),
  getWorldSpz
);

router.get("/:worldId", validateParams(worldIdParamSchema), getWorldDetail);

export default router;
