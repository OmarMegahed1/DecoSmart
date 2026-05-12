import { Router, Request as ExpressRequest, Response, NextFunction } from "express";
import { handleAuthRequest } from "../controllers/auth.controller";

const router = Router();

router.all("/*", (req: ExpressRequest, res: Response, next: NextFunction) => {
  handleAuthRequest(req, res).catch(next);
});

export default router;
