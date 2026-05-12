import { Request as ExpressRequest, Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { generations, projects } from "../db/schema";
import type { Generation } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).optional(),
  worldId: z.string().trim().min(1).optional(),
  caption: z.string().trim().max(2000).optional(),
  spzUrls: z
    .object({
      "100k": z.string().url().optional(),
      "500k": z.string().url().optional(),
      full_res: z.string().url().optional(),
    })
    .optional(),
});

export async function getProjects(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const userId = (req as unknown as AuthenticatedRequest).user.id;

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt));

    res.json({ projects: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function postProject(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const userId = (req as unknown as AuthenticatedRequest).user.id;
    const { name, operationId, worldId, caption, spzUrls } = req.body as z.infer<
      typeof createProjectSchema
    >;

    let generation: Generation | null = null;

    if (operationId) {
      const rows = await db
        .select()
        .from(generations)
        .where(and(eq(generations.operationId, operationId), eq(generations.userId, userId)))
        .limit(1);
      generation = rows[0] ?? null;
    }

    if (!generation && worldId) {
      const rows = await db
        .select()
        .from(generations)
        .where(and(eq(generations.worldId, worldId), eq(generations.userId, userId)))
        .limit(1);
      generation = rows[0] ?? null;
    }

    if ((operationId || worldId) && !generation) {
      res.status(404).json({ error: "Generation not found for this user" });
      return;
    }

    const [project] = await db
      .insert(projects)
      .values({
        userId,
        generationId: generation?.id ?? null,
        operationId: operationId ?? generation?.operationId ?? null,
        worldId: worldId ?? generation?.worldId ?? null,
        name,
        status: generation?.status ?? "done",
        caption: caption ?? null,
        spzUrls: (spzUrls ?? generation?.spzUrls ?? null) as any,
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function deleteProject(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const userId = (req as unknown as AuthenticatedRequest).user.id;
    const rawId = req.params["id"] as string;
    const id = typeof rawId === "string" ? rawId.trim() : "";

    if (!id || !UUID_RE.test(id)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }

    const removed = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning({ id: projects.id });

    if (removed.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.status(204).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
