import { Router, Request as ExpressRequest, Response } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getOperation, getWorld } from "./worldlabs.client";
import { db } from "../db/client";
import { generations } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

/**
 * GET /api/operations/:operationId
 *
 * Polls WorldLabs for the operation status.
 * When done, updates the generation record in DB with worldId + spzUrls.
 *
 * Returns: WorldLabs Operation object
 */
router.get(
  "/:operationId",
  requireAuth,
  async (req: ExpressRequest, res: Response): Promise<void> => {
    try {
      const operationId = req.params["operationId"] as string;
      const userId = (req as unknown as AuthenticatedRequest).user.id;

      // Verify this operation belongs to the authenticated user
      const [generation] = await db
        .select()
        .from(generations)
        .where(eq(generations.operationId, operationId))
        .limit(1);

      if (!generation) {
        res.status(404).json({ error: "Operation not found" });
        return;
      }

      if (generation.userId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Fetch live status from WorldLabs
      const operation = await getOperation(operationId);

      // If just completed, persist the world data
      if (operation.done && !operation.error && generation.status !== "done") {
        let world = operation.response;

        // Fallback: fetch world by metadata.world_id if response is empty
        if (!world && operation.metadata?.world_id) {
          world = await getWorld(operation.metadata.world_id);
        }

        if (world) {
          await db
            .update(generations)
            .set({
              status: "done",
              worldId: world.id,
              spzUrls: world.assets?.splats?.spz_urls ?? null,
              completedAt: new Date(),
            })
            .where(eq(generations.operationId, operationId));
        }
      }

      // If failed, mark it
      if (operation.error && generation.status !== "error") {
        await db
          .update(generations)
          .set({
            status: "error",
            errorMessage: operation.error.message,
          })
          .where(eq(generations.operationId, operationId));
      }

      res.json(operation);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

export default router;
