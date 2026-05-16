import type { Request as ExpressRequest, Response } from "express";
import { requireUser } from "../middleware/auth";
import type { CadProcessBody } from "../validation/cadJobs";
import { processCadDxfJob } from "../services/cadJobs/processDxfJob";
import { getCadJobRoomsForUser } from "../services/cadJobs/getCadJobRooms";
import { isCadPipelineConfigured } from "../clients/cadPipeline";
import { sendControllerError } from "../lib/sendControllerError";

export async function postCadProcess(req: ExpressRequest, res: Response): Promise<void> {
  const file = (req as ExpressRequest & { file?: Express.Multer.File }).file;

  if (!file) {
    res.status(400).json({ error: "dxf_file is required" });
    return;
  }

  if (!isCadPipelineConfigured()) {
    res.status(503).json({
      error:
        "CAD pipeline is not configured. Start the Kaggle notebook (Cell C) and " +
        "set CAD_PIPELINE_URL in backend/.env, then restart the backend.",
    });
    return;
  }

  try {
    const { user } = requireUser(req);
    const body = req.body as CadProcessBody;
    const result = await processCadDxfJob({
      userId: user.id,
      file: { buffer: file.buffer, originalname: file.originalname },
      body: {
        area_m2: body.area_m2,
        style: body.style,
        palette: body.palette,
      },
    });
    res.status(201).json(result);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[cad]");
    }
  }
}

export async function getCadRooms(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const { jobId } = req.params as { jobId: string };
    const payload = await getCadJobRoomsForUser(user.id, jobId);
    res.json(payload);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[cad]");
    }
  }
}
