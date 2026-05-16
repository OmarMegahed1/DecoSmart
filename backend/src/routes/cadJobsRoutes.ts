import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validation";
import { cadJobIdParamSchema, cadProcessBodySchema } from "../validation/cadJobs";
import { getCadRooms, postCadProcess } from "../controllers/cadJobsController";

/**
 * Resource: cad-jobs.
 * - POST /process — DXF pipeline (multipart DXF + area_m2).
 * - GET /:jobId/rooms — room list for a job.
 */
const router = Router();

router.use(requireAuth); // use the requireAuth middleware to authenticate the request

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    const isDxf =
      name.endsWith(".dxf") ||
      mime === "application/dxf" ||
      mime === "image/vnd.dxf" ||
      mime === "application/x-dxf" ||
      mime === "application/octet-stream";
    if (isDxf) return cb(null, true);
    cb(new Error("Only .dxf files are accepted for CAD processing"));
  },
});

const cadProcessPipeline = [
  upload.single("dxf_file"),
  validateBody(cadProcessBodySchema),
  postCadProcess,
];

router.post("/process", ...cadProcessPipeline);

router.get("/:jobId/rooms", validateParams(cadJobIdParamSchema), getCadRooms);

export default router;
