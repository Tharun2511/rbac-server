import { Request, Response } from 'express';
import * as ticketService from './tickets.service';

export const createTicket = async (req: Request, res: Response) => {
    try {
        const { title, description, priority, type } = req.body;
        const orgId = req.headers['x-org-id'] as string;
        const projectId = req.headers['x-project-id'] as string;
        const userId = req.user?.userId;

        if (!orgId) return res.status(400).json({ message: 'Organization context required' });
        if (!projectId) return res.status(400).json({ message: 'Please select a project before creating a ticket' });
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const ticket = await ticketService.createTicket({
            title, description, priority: priority || 'LOW', type: type || 'TICKET',
            orgId, projectId, createdBy: userId
        });
        res.status(201).json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create ticket' });
    }
};

export const getMyTickets = async (req: Request, res: Response) => {
    try {
        const orgId = req.headers['x-org-id'] as string;
        const projectId = req.headers['x-project-id'] as string;
        const userId = req.user?.userId;

        if (!orgId) return res.status(400).json({ message: 'Organization context required' });
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        // Use userId filter: returns tickets where user is creator OR resolver
        const tickets = await ticketService.getTickets(orgId, projectId, undefined, undefined, userId);
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch tickets' });
    }
};

export const getTickets = async (req: Request, res: Response) => {
    try {
        const orgId = req.headers['x-org-id'] as string;
        const projectId = req.headers['x-project-id'] as string;
        
        if (!orgId) return res.status(400).json({ message: 'Organization context required' });

        const tickets = await ticketService.getTickets(orgId, projectId);
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch tickets' });
    }
};

export const getTicket = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const orgId = req.headers['x-org-id'] as string;
        if (!orgId) return res.status(400).json({ message: 'Organization context required' });

        const ticket = await ticketService.getTicketById(id, orgId);
        res.json(ticket);
    } catch (error) {
        res.status(404).json({ message: 'Ticket not found' });
    }
};

export const updateTicket = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.user?.userId;
        const ticket = await ticketService.updateTicket(id, updates, userId);
        res.json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update ticket' });
    }
};

export const updateTicketClassification = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { type, priority } = req.body;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const ticket = await ticketService.classifyTicket(id, userId, type, priority);
        res.json(ticket);
    } catch (error: any) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to classify ticket' });
    }
};

export const assignTicket = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { resolverId } = req.body;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!resolverId) return res.status(400).json({ message: 'resolverId is required' });

        const ticket = await ticketService.assignTicket(id, userId, resolverId);
        res.json(ticket);
    } catch (error: any) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to assign ticket' });
    }
};

export const resolveTicket = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const ticket = await ticketService.resolveTicket(id, userId);
        res.json(ticket);
    } catch (error: any) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to resolve ticket' });
    }
};

export const verifyTicket = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const ticket = await ticketService.verifyTicket(id, userId);
        res.json(ticket);
    } catch (error: any) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to verify ticket' });
    }
};

export const closeTicket = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const ticket = await ticketService.closeTicket(id, userId);
        res.json(ticket);
    } catch (error: any) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to close ticket' });
    }
};
