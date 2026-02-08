import { Router } from "express";
import { getTicketTimeline } from "./timeline.controller";
import authMiddleware from "../../middlewares/auth.middleware";
import { requirePermission } from "../../middlewares/rbac.middleware";

const router = Router();
router.use(authMiddleware);

// Viewing timeline requires viewing the ticket generally.
router.get("/:ticketId", requirePermission('ticket.view'), getTicketTimeline);

export default router;
