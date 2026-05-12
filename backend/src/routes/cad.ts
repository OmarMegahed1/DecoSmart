import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { getCadRooms, postCadProcess } from "../controllers/cad.controller";

const router = Router();

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

router.post("/process", requireAuth, upload.single("dxf_file"), postCadProcess);

router.get("/rooms/:jobId", requireAuth, getCadRooms);

export default router;
