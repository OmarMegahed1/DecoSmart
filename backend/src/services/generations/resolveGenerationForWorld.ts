import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { generations, projects } from "../../db/schema";
import type { Generation } from "../../db/schema";

/**
 * Resolves a generation row for a world: direct `world_id` match, then project-linked fallbacks,
 * then optional `operationId` lookup (SPZ proxy).
 */
export async function resolveGenerationForWorld(
  userId: string, // userId is the authenticated user from router.use(requireAuth) in generationsRoutes.ts
  worldId: string, // worldId is the id of the world from the request
  options?: { operationId?: string } // options is the options for the generation
): Promise<Generation | undefined> {
  let [generation] = await db // select the generation from the database
    .select() // select the generation from the database
    .from(generations) // from the generations table
    .where(eq(generations.worldId, worldId)) // where the worldId is the id of the world
    .limit(1); // limit the generation to 1

  if (!generation) { // if the generation is not found, select the project from the database
    const [project] = await db // select the project from the database
      .select() // select the project from the database
      .from(projects) // from the projects table
      .where(and(eq(projects.worldId, worldId), eq(projects.userId, userId))) // where the worldId is the id of the world and the userId is the authenticated user from router.use(requireAuth) in generationsRoutes.ts
      .limit(1); // limit the project to 1

    if (project?.generationId) { // if the project has a generation id, select the generation from the database
      const rows = await db // select the generation from the database
        .select() // select the generation from the database
        .from(generations) // from the generations table
        .where(eq(generations.id, project.generationId)) // where the id is the id of the generation
        .limit(1); // limit the generation to 1
      generation = rows[0]; // generation is the generation from the database
    }

    if (!generation && project?.operationId) { // if the generation is not found and the project has an operation id, select the generation from the database
      const rows = await db // select the generation from the database
        .select() // select the generation from the database
        .from(generations) // from the generations table
        .where(eq(generations.operationId, project.operationId)) // where the operationId is the id of the operation
        .limit(1); // limit the generation to 1
      generation = rows[0]; // generation is the generation from the database
    }
  }

  if (!generation && options?.operationId) { // if the generation is not found and the options has an operation id, select the generation from the database
    const byOperation = await db // select the generation from the database
      .select() // select the generation from the database
      .from(generations) // from the generations table
      .where(eq(generations.operationId, options.operationId)) // where the operationId is the id of the operation
      .limit(1); // limit the generation to 1
    generation = byOperation[0]; // generation is the generation from the database
  }

  return generation; // generation is the generation from the database
}
