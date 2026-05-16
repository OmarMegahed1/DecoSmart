import { Router, Request as ExpressRequest, Response, NextFunction } from "express";
import { handleAuthRequest } from "../controllers/authController";

const router = Router();

router.all("/*", (req: ExpressRequest, res: Response, next: NextFunction) => {
  handleAuthRequest(req, res).catch(next);
});

export default router;
