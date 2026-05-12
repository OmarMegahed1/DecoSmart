import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getWorldDetail,
  getWorldSpz,
  listGenerations,
} from "../controllers/worlds.controller";

const router = Router();

router.get("/", requireAuth, listGenerations);

router.get("/:worldId/spz/:quality", requireAuth, getWorldSpz);

router.get("/:worldId", requireAuth, getWorldDetail);

export default router;
