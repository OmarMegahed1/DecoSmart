import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { generations } from "../../db/schema";
import { getWorld, type World } from "../../clients/worldlabs";
import { HttpError } from "../../lib/httpError";
import { resolveGenerationForWorld } from "../generations/resolveGenerationForWorld";

export async function listGenerationsForUser(userId: string) { // list the generations for the user
  const history = await db // select the generations from the database
    .select() // select the generations from the database
    .from(generations) // from the generations table
    .where(eq(generations.userId, userId)) // where the userId is the id of the user
    .orderBy(desc(generations.createdAt)) // order the generations by the created at date
    .limit(50); // limit the generations to 50

  return { generations: history }; // generations is the generations from the database
}

export async function getWorldDetailForUser(userId: string, worldId: string): Promise<World> { // get the world detail for the user
  const resolvedGeneration = await resolveGenerationForWorld(userId, worldId); // resolve the generation for the world

  if (!resolvedGeneration) { // if the generation is not found, throw an error
    throw new HttpError(404, "World not found");
  }

  if (resolvedGeneration.userId !== userId) { // if the user id is not the same as the user id from the request, throw an error
    throw new HttpError(403, "Forbidden");
  }

  return getWorld(worldId); // get the world from the database
}
