import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { generateBodySchema, postGenerate } from "../controllers/generate.controller";

const router = Router();

router.post("/", requireAuth, validateBody(generateBodySchema), postGenerate);

export default router;
