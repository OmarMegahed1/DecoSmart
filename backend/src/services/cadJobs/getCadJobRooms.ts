import { eq, asc } from "drizzle-orm";
import { db } from "../../db/client";
import { cadJobs, roomResults } from "../../db/schema";
import { HttpError } from "../../lib/httpError";
import {
  toCadJobRoomsApiResponse,
  type CadJobRoomsApiResponse,
} from "../../mappers/cadJobRooms";

export type { CadJobRoomsApiResponse } from "../../mappers/cadJobRooms";

export async function getCadJobRoomsForUser( 
  userId: string, // userId is the authenticated user from router.use(requireAuth) in cadJobsRoutes.ts
  jobId: string // jobId is the id of the job from the request
): Promise<CadJobRoomsApiResponse> {
  const [job] = await db // select the job from the database
    .select() // select the job from the database
    .from(cadJobs) // from the cadJobs table
    .where(eq(cadJobs.id, String(jobId))) // where the jobId is the id of the job
    .limit(1); // limit the job to 1

  if (!job) { // if the job is not found, throw an error
    throw new HttpError(404, "CAD job not found"); // throw an error if the job is not found
  }

  if (job.userId !== userId) { // if the userId is not the same as the userId in the job, throw an error
    throw new HttpError(403, "Forbidden"); // throw an error if the userId is not the same as the userId in the job
  }

  const rows = await db
    .select() // select the rows from the database
    .from(roomResults) // from the roomResults table
    .where(eq(roomResults.cadJobId, String(jobId))) // where the cadJobId is the id of the job
    .orderBy(asc(roomResults.roomIndex)); // order the rows by the roomIndex

  return toCadJobRoomsApiResponse(job, rows); // return the cad job rooms api response
}
