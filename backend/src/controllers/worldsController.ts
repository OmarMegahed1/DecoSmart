import type { Request as ExpressRequest, Response } from "express";
import { requireUser } from "../middleware/auth";
import { getWorldDetailForUser } from "../services/worlds/worldService";
import { sendControllerError } from "../lib/sendControllerError";

export async function getWorldDetail(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const { worldId } = req.params as { worldId: string };
    const world = await getWorldDetailForUser(user.id, worldId);
    res.json(world);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[worlds]");
    }
  }
}
