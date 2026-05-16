import type { Request as ExpressRequest, Response } from "express";
import { requireUser } from "../middleware/auth";
import { getOperationWithGenerationSync } from "../services/operations/operationService";
import { sendControllerError } from "../lib/sendControllerError";

export async function getOperationById(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const { operationId } = req.params as { operationId: string };
    const operation = await getOperationWithGenerationSync(user.id, operationId);
    res.json(operation);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[operations]");
    }
  }
}
