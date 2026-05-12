import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { postUpload } from "../controllers/upload.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const m = (file.mimetype || "").toLowerCase();
    const okImage = m.startsWith("image/");
    const okDxf =
      name.endsWith(".dxf") ||
      m === "application/dxf" ||
      m === "image/vnd.dxf" ||
      m === "application/x-dxf";
    if (okImage || okDxf) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image or DXF (.dxf) files are allowed"));
  },
});

router.post("/", requireAuth, upload.single("file"), postUpload);

export default router;
