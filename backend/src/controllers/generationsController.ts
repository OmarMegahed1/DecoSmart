import type { Request as ExpressRequest, Response } from "express";
import { requireUser } from "../middleware/auth";
import type { GenerateBody } from "../validation/generations";
import { createWorldGeneration } from "../services/generations/createGeneration";
import { listGenerationsForUser } from "../services/worlds/worldService";
import { sendControllerError } from "../lib/sendControllerError";

export async function listGenerations(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const payload = await listGenerationsForUser(user.id);
    res.json(payload);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[generations]");
    }
  }
}

export async function postGenerate(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const result = await createWorldGeneration({
      userId: user.id,
      body: req.body as GenerateBody,
    });

    res.status(201).json({
      operation_id: result.operation_id,
      generation_id: result.generation_id,
    });
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[generate]");
    }
  }
}
