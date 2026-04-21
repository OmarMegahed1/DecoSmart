import { Router, Request as ExpressRequest, Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getOperation, getWorld } from "./worldlabs.client";
import { db } from "../db/client";
import { generations, projects } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

const allowedSpzQualities = new Set(["100k", "500k", "full_res"]);
const qualityPreference: Array<"full_res" | "500k" | "100k"> = ["full_res", "500k", "100k"];

/**
 * GET /api/worlds
 */
router.get(
  "/",
  requireAuth,
  async (req: ExpressRequest, res: Response): Promise<void> => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user.id;

      const history = await db
        .select()
        .from(generations)
        .where(eq(generations.userId, userId))
        .orderBy(desc(generations.createdAt))
        .limit(50);

      res.json({ generations: history });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/worlds/:worldId/spz/:quality
 *
 * Proxies WorldLabs SPZ asset to avoid client-side CORS/embed restrictions.
 */
router.get(
  "/:worldId/spz/:quality",
  requireAuth,
  async (req: ExpressRequest, res: Response): Promise<void> => {
    try {
      const worldId = req.params["worldId"] as string;
      const quality = req.params["quality"] as string;
      const operationId = (req.query["operationId"] as string | undefined) ?? undefined;
      const userId = (req as unknown as AuthenticatedRequest).user.id;

      if (!allowedSpzQualities.has(quality)) {
        res.status(400).json({ error: "Invalid SPZ quality" });
        return;
      }

      let [generation] = await db
        .select()
        .from(generations)
        .where(eq(generations.worldId, worldId))
        .limit(1);

      // Fallback: world may be saved in projects before generation.worldId is persisted.
      if (!generation) {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(eq(projects.worldId, worldId), eq(projects.userId, userId)))
          .limit(1);

        if (project?.generationId) {
          const rows = await db
            .select()
            .from(generations)
            .where(eq(generations.id, project.generationId))
            .limit(1);
          generation = rows[0];
        }

        if (!generation && project?.operationId) {
          const rows = await db
            .select()
            .from(generations)
            .where(eq(generations.operationId, project.operationId))
            .limit(1);
          generation = rows[0];
        }
      }

      // Fallback for cases where worldId was not persisted to DB yet.
      if (!generation && operationId) {
        const byOperation = await db
          .select()
          .from(generations)
          .where(eq(generations.operationId, operationId))
          .limit(1);
        generation = byOperation[0];
      }

      if (!generation) {
        res.status(404).json({ error: "World not found" });
        return;
      }

      if (generation.userId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Resolve the canonical world ID with operation metadata fallback.
      let resolvedWorldId = generation.worldId ?? worldId;
      let operationWorld: any | null = null;

      if (!generation.worldId && operationId) {
        try {
          const operation = await getOperation(operationId);
          operationWorld = operation.response as any;
          const opWorldId =
            operation.metadata?.world_id ||
            (operation.response as any)?.id ||
            (operation.response as any)?.world_id;
          if (opWorldId) {
            resolvedWorldId = opWorldId;
          }
        } catch {
          // Keep fallback world id; downstream getWorld will validate existence.
        }
      }

      let worldSpz: Partial<Record<"100k" | "500k" | "full_res", string>> | undefined;
      try {
        const world = await getWorld(resolvedWorldId);
        worldSpz = world.assets?.splats?.spz_urls;
      } catch {
        // Fallback to operation response SPZ URLs when world lookup fails.
        if (!operationWorld && operationId) {
          try {
            const operation = await getOperation(operationId);
            operationWorld = operation.response as any;
          } catch {
            // no-op
          }
        }
        worldSpz = operationWorld?.assets?.splats?.spz_urls;
      }

      const dbSpz = generation.spzUrls ?? undefined;

      const pickFromMap = (
        map?: Partial<Record<"100k" | "500k" | "full_res", string>> | null,
        requested?: string
      ): { url?: string; quality?: string } => {
        if (!map) return {};

        const requestedKey = requested as "100k" | "500k" | "full_res";
        if (requestedKey && map[requestedKey]) {
          return { url: map[requestedKey], quality: requestedKey };
        }

        for (const q of qualityPreference) {
          if (map[q]) return { url: map[q], quality: q };
        }
        return {};
      };

      const fromWorld = pickFromMap(worldSpz, quality);
      const fromDb = pickFromMap(dbSpz as any, quality);
      const spzUrl = fromWorld.url ?? fromDb.url;
      const selectedQuality = fromWorld.quality ?? fromDb.quality;

      if (!spzUrl) {
        res.status(404).json({
          error: "SPZ URL unavailable for requested world",
          requestedQuality: quality,
          availableWorldQualities: worldSpz ? Object.keys(worldSpz) : [],
          availableDbQualities: dbSpz ? Object.keys(dbSpz as Record<string, unknown>) : [],
        });
        return;
      }

      const upstream = await fetch(spzUrl);
      if (!upstream.ok) {
        res.status(502).json({ error: `Failed to fetch SPZ asset (${upstream.status})` });
        return;
      }

      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");

      res.setHeader("Content-Type", contentType);
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
      if (selectedQuality) {
        res.setHeader("X-SPZ-Quality", selectedQuality);
      }
      res.setHeader("Cache-Control", "private, max-age=60");

      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.status(200).send(bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message, worldId: req.params["worldId"], operationId: req.query["operationId"] });
    }
  }
);

/**
 * GET /api/worlds/:worldId
 */
router.get(
  "/:worldId",
  requireAuth,
  async (req: ExpressRequest, res: Response): Promise<void> => {
    try {
      const worldId = req.params["worldId"] as string;
      const userId = (req as unknown as AuthenticatedRequest).user.id;

      const [generation] = await db
        .select()
        .from(generations)
        .where(eq(generations.worldId, worldId))
        .limit(1);

      let resolvedGeneration = generation;

      if (!resolvedGeneration) {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(eq(projects.worldId, worldId), eq(projects.userId, userId)))
          .limit(1);

        if (project?.generationId) {
          const rows = await db
            .select()
            .from(generations)
            .where(eq(generations.id, project.generationId))
            .limit(1);
          resolvedGeneration = rows[0];
        }

        if (!resolvedGeneration && project?.operationId) {
          const rows = await db
            .select()
            .from(generations)
            .where(eq(generations.operationId, project.operationId))
            .limit(1);
          resolvedGeneration = rows[0];
        }
      }

      if (!resolvedGeneration) {
        res.status(404).json({ error: "World not found" });
        return;
      }

      if (resolvedGeneration.userId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const world = await getWorld(worldId);
      res.json(world);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

export default router;
