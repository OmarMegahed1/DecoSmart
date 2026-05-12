import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getOperationById } from "../controllers/operations.controller";

const router = Router();

router.get("/:operationId", requireAuth, getOperationById);

export default router;
