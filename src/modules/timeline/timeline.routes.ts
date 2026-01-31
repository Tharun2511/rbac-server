import { Router } from "express";
import { getTicketTimeline } from "./timeline.controller";
import authMiddleware from "../../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/:ticketId", getTicketTimeline);

export default router;
