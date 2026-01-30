import { Request, Response } from 'express';
import * as commentService from './comments.service';

export const createComment = async (req: Request, res: Response) => {
    const { ticketId } = req.params;
    const { comment } = req.body;
    const userId = req.user?.userId;

    if (!ticketId || !comment) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const commentData = await commentService.createComment(ticketId, userId!, comment);
        return res.status(201).json(commentData);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const getComments = async (req: Request, res: Response) => {
    const { ticketId } = req.params;

    if (!ticketId) {
        return res.status(400).json({ message: 'Missing ticketId' });
    }

    try {
        const commentsData = await commentService.getCommentsByTicketId(ticketId);
        return res.status(200).json(commentsData);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};
