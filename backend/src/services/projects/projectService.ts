import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { generations, projects } from "../../db/schema";
import type { Generation } from "../../db/schema";
import type { CreateProjectBody } from "../../validation/projects";
import { HttpError } from "../../lib/httpError";

export async function listProjectsForUser(userId: string) { // list the projects for the user
  const rows = await db // select the projects from the database
    .select() // select the projects from the database
    .from(projects) // from the projects table
    .where(eq(projects.userId, userId)) // where the userId is the id of the user
    .orderBy(desc(projects.createdAt)); // order the projects by the created at date

  return { projects: rows }; // projects is the projects from the database
}

export async function createProjectForUser(userId: string, body: CreateProjectBody) {
  const { name, operationId, worldId, caption, spzUrls } = body; // name is the name of the project, operationId is the id of the operation, worldId is the id of the world, caption is the caption of the project, spzUrls is the spz urls for the project

  let generation: Generation | null = null; // generation is the generation from the database

  if (operationId) { // if the operation id is provided, select the generation from the database
    const rows = await db // select the generation from the database
      .select() // select the generation from the database
      .from(generations) // from the generations table
      .where(and(eq(generations.operationId, operationId), eq(generations.userId, userId))) // where the operationId is the id of the operation and the userId is the id of the user
      .limit(1); // limit the generation to 1
    generation = rows[0] ?? null; // generation is the generation from the database
  }

  if (!generation && worldId) { // if the generation is not found and the world id is provided, select the generation from the database
    const rows = await db // select the generation from the database
      .select() // select the generation from the database
      .from(generations) // from the generations table
      .where(and(eq(generations.worldId, worldId), eq(generations.userId, userId))) // where the worldId is the id of the world and the userId is the id of the user
      .limit(1); // limit the generation to 1
    generation = rows[0] ?? null; // generation is the generation from the database
  }

  if ((operationId || worldId) && !generation) { // if the operation id or world id is provided and the generation is not found, throw an error
    throw new HttpError(404, "Generation not found for this user");
  }

  const [project] = await db // insert the project into the database
    .insert(projects) // insert the projects table
    .values({
      userId, // userId is the id of the user
      generationId: generation?.id ?? null, // generationId is the id of the generation
      operationId: operationId ?? generation?.operationId ?? null, // operationId is the id of the operation
      worldId: worldId ?? generation?.worldId ?? null,
      name, // name is the name of the project
      status: generation?.status ?? "done", // status is the status of the project
      caption: caption ?? null, // caption is the caption of the project
      spzUrls: (spzUrls ?? generation?.spzUrls ?? null) as any, // spzUrls is the spz urls for the project
      updatedAt: new Date(), // updatedAt is the date the project was updated
    })
    .returning(); // return the project from the database

  if (!project) { // if the project is not found, throw an error
    throw new Error("Failed to create project"); // failed to create project
  }

  return project; // project is the project from the database
}

export async function deleteProjectForUser(userId: string, projectId: string): Promise<void> { // delete the project for the user
  const removed = await db // delete the project from the database
    .delete(projects) // delete the projects table
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId))) // where the id is the id of the project and the userId is the id of the user
    .returning({ id: projects.id }); // return the id of the project from the database

  if (removed.length === 0) { // if the project is not found, throw an error
    throw new HttpError(404, "Project not found"); // project not found
  }
}
