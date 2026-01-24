import { Request, Response } from 'express';
import * as ticketService from './tickets.service';

export const createTicket = async (req: Request, res: Response) => {
    const { title, description } = req.body;

    if (!title || !description) return res.status(400).json({ message: 'Missing Required Fields' });

    try {
        const createdTicket = await ticketService.createTicket(req.user?.userId!, {
            title,
            description,
        });
        return res.status(201).json(createdTicket);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const assignTicket = async (req: Request, res: Response) => {
    const { ticketId } = req.params;
    const { resolverId } = req.body;

    if (!ticketId || !resolverId)
        return res.status(400).json({ message: 'Missing Required fields' });

    try {
        await ticketService.assignTicket(ticketId, resolverId);
        return res.status(200).json({ message: 'Assigned ticket successfully' });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const resolveTicket = async (req: Request, res: Response) => {
    const { ticketId } = req.params;
    const resolverId = req.user?.userId;

    if (!ticketId || !resolverId)
        return res.status(400).json({ message: 'Missing Required fields' });

    try {
        await ticketService.resolveTicket(ticketId, resolverId);
        return res.status(200).json({ message: 'Assigned ticket successfully' });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const verifyTicketResolved = async (req: Request, res: Response) => {
    const { ticketId } = req.params;
    const verifierId = req.user?.userId;

    if (!ticketId) return res.status(400).json({ message: 'Missing Required fields' });

    try {
        await ticketService.verifyResolveStatus(ticketId, verifierId!);
        return res.status(200).json({ message: 'Ticket verified successfully' });
    } catch (error: any) {
        return res.status(500).json({ Message: error.message });
    }
};

export const closeTicket = async (req: Request, res: Response) => {
    const { ticketId } = req.params;
    const managerId = req.user?.userId;

    if (!ticketId) return res.status(400).json({ message: 'Missing Required fields' });

    try {
        await ticketService.closeTicket(ticketId, managerId!);
        return res.status(200).json({ message: 'Ticket verified successfully' });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const listAllTickets = async (_req: Request, res: Response) => {
    try {
        const tickets = await ticketService.findAllTickets();
        return res.status(200).json(tickets);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const findTicketById = async (req: Request, res: Response) => {
    const { ticketId } = req.params;

    if (!ticketId) return res.status(400).json({ message: 'TicketId is not valid' });

    return await ticketService.findTicketById(ticketId);
};

export const getMyTickets = async (req: Request, res: Response) => {
    const myTickets = await ticketService.getMyTickets(req.user?.userId || '');
    return res.status(200).json(myTickets);
};

export const getHistoryTickets = async (req: Request, res: Response) => {
    const tickets = await ticketService.getHistoryTickets(req.user?.userId || '');
    return res.status(200).json(tickets);
};
