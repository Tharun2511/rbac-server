import { Request, Response } from "express";
import * as service from "./timeline.service";

export async function getTicketTimeline(req: Request, res: Response) {
    try {
        const { ticketId } = req.params;
        const timeline = await service.getTimeline(ticketId);
        return res.status(200).json(timeline);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
}
