import type { Request as ExpressRequest, Response } from "express";
import type { UploadBody } from "../validation/uploads";
import { processUpload } from "../services/uploads/processUpload";
import { sendControllerError } from "../lib/sendControllerError";

export async function postUpload(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const file = (req as ExpressRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const result = await processUpload({
      file,
      body: req.body as UploadBody,
    });

    res.json(result.payload);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[upload]");
    }
  }
}
