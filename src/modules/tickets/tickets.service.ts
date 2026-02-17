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

// ─── Granular Ticket Actions ────────────────────────────────────

const createServiceError = (message: string, statusCode: number) => {
    const error: any = new Error(message);
    error.statusCode = statusCode;
    return error;
};

export const classifyTicket = async (ticketId: string, performedBy: string, type?: string, priority?: string) => {
    const ticket = await ticketRepo.getTicketByIdOnly(ticketId);
    if (!ticket) throw createServiceError('Ticket not found', 404);
    if (ticket.status !== 'OPEN' && ticket.status !== 'ASSIGNED') {
        throw createServiceError('Ticket can only be classified when OPEN or ASSIGNED', 400);
    }

    const updates: any = {};
    if (type && type !== ticket.type) updates.type = type;
    if (priority && priority !== ticket.priority) updates.priority = priority;

    if (Object.keys(updates).length === 0) return ticket;

    const updated = await ticketRepo.updateTicket(ticketId, updates);

    if (updates.type) {
        await addActivity(ticketId, performedBy, ActivityTypes.TYPE_CHANGED, {
            oldType: ticket.type,
            newType: updates.type,
        });
    }
    if (updates.priority) {
        await addActivity(ticketId, performedBy, ActivityTypes.PRIORITY_CHANGED, {
            oldPriority: ticket.priority,
            newPriority: updates.priority,
        });
    }

    return updated;
};

export const assignTicket = async (ticketId: string, performedBy: string, resolverId: string) => {
    const ticket = await ticketRepo.getTicketByIdOnly(ticketId);
    if (!ticket) throw createServiceError('Ticket not found', 404);
    if (ticket.status !== 'OPEN') {
        throw createServiceError('Ticket can only be assigned when OPEN', 400);
    }

    const updated = await ticketRepo.updateTicket(ticketId, {
        resolverId,
        status: 'ASSIGNED',
    });

    await addActivity(ticketId, performedBy, ActivityTypes.ASSIGNED, { resolverId });

    return updated;
};

export const resolveTicket = async (ticketId: string, performedBy: string) => {
    const ticket = await ticketRepo.getTicketByIdOnly(ticketId);
    if (!ticket) throw createServiceError('Ticket not found', 404);
    if (ticket.status !== 'ASSIGNED') {
        throw createServiceError('Ticket can only be resolved when ASSIGNED', 400);
    }

    const updated = await ticketRepo.updateTicket(ticketId, { status: 'RESOLVED' });
    await addActivity(ticketId, performedBy, ActivityTypes.RESOLVED, {});

    return updated;
};

export const verifyTicket = async (ticketId: string, performedBy: string) => {
    const ticket = await ticketRepo.getTicketByIdOnly(ticketId);
    if (!ticket) throw createServiceError('Ticket not found', 404);
    if (ticket.status !== 'RESOLVED') {
        throw createServiceError('Ticket can only be verified when RESOLVED', 400);
    }

    const updated = await ticketRepo.updateTicket(ticketId, { status: 'VERIFIED' });
    await addActivity(ticketId, performedBy, ActivityTypes.VERIFIED, {});

    return updated;
};

export const closeTicket = async (ticketId: string, performedBy: string) => {
    const ticket = await ticketRepo.getTicketByIdOnly(ticketId);
    if (!ticket) throw createServiceError('Ticket not found', 404);
    if (ticket.status !== 'VERIFIED') {
        throw createServiceError('Ticket can only be closed when VERIFIED', 400);
    }

    const updated = await ticketRepo.updateTicket(ticketId, { status: 'CLOSED' });
    await addActivity(ticketId, performedBy, ActivityTypes.CLOSED, {});

    return updated;
};
