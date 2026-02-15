import * as ticketRepo from './tickets.repository';
import { addActivity } from '../activity/activity.service';
import { ActivityTypes } from '../activity/activity.types';

export const createTicket = async (data: {
    title: string;
    description: string;
    priority: string;
    type: string;
    orgId: string;
    projectId?: string;
    createdBy: string;
}) => {
    const ticket = await ticketRepo.createTicket(data);

    // Log activity
    await addActivity(ticket.id, data.createdBy, ActivityTypes.CREATED, {
        title: data.title,
        priority: data.priority,
    });

    return ticket;
};

export const getTickets = async (orgId: string, projectId?: string, resolverId?: string, createdBy?: string, userId?: string) => {
    return await ticketRepo.getTickets({ orgId, projectId, resolverId, createdBy, userId });
};

export const getTicketById = async (ticketId: string, orgId: string) => {
    const ticket = await ticketRepo.getTicketById(ticketId, orgId);
    if (!ticket) throw new Error('Ticket not found or access denied');
    return ticket;
};

export const updateTicket = async (ticketId: string, updates: any, performedBy?: string) => {
    // Get the current ticket for comparison
    const oldTicket = performedBy ? await ticketRepo.getTicketByIdOnly(ticketId) : null;

    const updatedTicket = await ticketRepo.updateTicket(ticketId, updates);

    // Log activity for status changes
    if (performedBy && oldTicket) {
        if (updates.status && updates.status !== oldTicket.status) {
            await addActivity(ticketId, performedBy, ActivityTypes.STATUS_CHANGED, {
                oldStatus: oldTicket.status,
                newStatus: updates.status,
            });
        }

        if (updates.priority && updates.priority !== oldTicket.priority) {
            await addActivity(ticketId, performedBy, ActivityTypes.PRIORITY_CHANGED, {
                oldPriority: oldTicket.priority,
                newPriority: updates.priority,
            });
        }

        if (updates.resolverId && updates.resolverId !== oldTicket.resolverId) {
            await addActivity(ticketId, performedBy, ActivityTypes.ASSIGNED, {
                resolverId: updates.resolverId,
            });
        }
    }

    return updatedTicket;
};
