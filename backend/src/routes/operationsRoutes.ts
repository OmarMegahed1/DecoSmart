import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateParams } from "../middleware/validation";
import { operationIdParamSchema } from "../validation/operations";
import { getOperationById } from "../controllers/operationsController";

/**
 * Only `/:operationId` today; add any static segments (e.g. `/export`) above this line.
 */
const router = Router();

router.use(requireAuth);

router.get("/:operationId", validateParams(operationIdParamSchema), getOperationById);

export default router;
