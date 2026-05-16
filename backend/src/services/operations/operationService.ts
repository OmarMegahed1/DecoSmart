import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { generations } from "../../db/schema";
import { getOperation, getWorld, type Operation } from "../../clients/worldlabs";
import { HttpError } from "../../lib/httpError";

export async function getOperationWithGenerationSync( 
  userId: string, // userId is the authenticated user from router.use(requireAuth) in generationsRoutes.ts
  operationId: string // operationId is the id of the operation from the request
): Promise<Operation> {
  const [generation] = await db // select the generation from the database
    .select() // select the generation from the database
    .from(generations) // from the generations table
    .where(eq(generations.operationId, operationId)) // where the operationId is the id of the operation
    .limit(1); // limit the generation to 1

  if (!generation) { // if the generation is not found, throw an error
    throw new HttpError(404, "Operation not found");
  }

  if (generation.userId !== userId) { // if the user id is not the same as the user id from the request, throw an error
    throw new HttpError(403, "Forbidden");
  }

  const operation = await getOperation(operationId); // get the status of the operation

  if (operation.done && !operation.error && generation.status !== "done") {
    let world = operation.response; // world is the response from the operation

    if (!world && operation.metadata?.world_id) { // if the world is not found and the metadata has a world id, get the world from the operation
      world = await getWorld(operation.metadata.world_id); // get the world from the operation
    }

    if (world) {
      await db // update the generation in the database
        .update(generations) // update the generations table
        .set({
          status: "done", // status is the status for the generation
          worldId: world.id, // worldId is the id of the world
          spzUrls: world.assets?.splats?.spz_urls ?? null, // spzUrls is the spz urls for the generation
          completedAt: new Date(), // completedAt is the date the generation was completed
        })
        .where(eq(generations.operationId, operationId)); // where the operationId is the id of the operation
    }
  }

  if (operation.error && generation.status !== "error") { // if the operation has an error and the generation status is not error, update the generation in the database
    await db // update the generation in the database
      .update(generations) // update the generations table
      .set({ // set the values for the generation
        status: "error", // status is the status for the generation
        errorMessage: operation.error.message, // errorMessage is the error message for the generation
      })
      .where(eq(generations.operationId, operationId)); // where the operationId is the id of the operation
  }

  return operation; // Marble async job payload from `getOperation` but synced with our DB with status and error message
}
