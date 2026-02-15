import { Request, Response } from 'express';
import * as commentService from './comments.service';

export const createComment = async (req: Request, res: Response) => {
    const { id } = req.params; // ticketId from route /:id
    const { comment } = req.body;
    const userId = req.user?.userId;
    const orgId = req.headers['x-org-id'] as string;

    if (!id || !comment) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!orgId) return res.status(400).json({ message: 'Organization context required' });
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const commentData = await commentService.createComment(id, userId, comment, orgId);
        return res.status(201).json(commentData);
    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ message: error.message || 'Failed to create comment' });
    }
};

export const getComments = async (req: Request, res: Response) => {
    const { id } = req.params; // ticketId
    const orgId = req.headers['x-org-id'] as string;

    if (!id) {
        return res.status(400).json({ message: 'Missing ticketId' });
    }
    if (!orgId) return res.status(400).json({ message: 'Organization context required' });

    try {
        const commentsData = await commentService.getCommentsByTicketId(id, orgId);
        return res.status(200).json(commentsData);
    } catch (error: any) {
        // console.error(error);
        return res.status(500).json({ message: error.message || 'Failed to fetch comments' });
    }
};
