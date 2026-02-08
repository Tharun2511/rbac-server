import * as ticketRepo from './tickets.repository';
import * as userService from '../users/user.service';
import * as activityService from '../activity/activity.service';
import { ActivityTypes } from '../activity/activity.types';

export const createTicket = async (userId: string, data: { title: string; description: string; priority?: string }) => {
    const ticket = await ticketRepo.createTicket({
        title: data.title,
        description: data.description,
        created_by: userId,
        priority: data.priority
    });
    if (ticket) {
        await activityService.addActivity(ticket.id, userId, ActivityTypes.CREATED, { title: data.title });
    }
    return ticket;
};

export const assignTicket = async (ticketId: string, resolverId: string, assignedBy: string) => {
    const ticket = await ticketRepo.assignTicket(ticketId, resolverId);

    if (!ticket) {
        throw new Error('Ticket not in OPEN state');
    }

    // Check if type is still default 'TICKET'
    if (ticket.type === 'TICKET') {
        throw new Error('Manager must set ticket type before assigning');
    }

    await activityService.addActivity(ticketId, assignedBy, ActivityTypes.ASSIGNED, { resolverId });

    return ticket;
};

export const findAllTickets = async () => {
    return await ticketRepo.findAllTickets();
};

export const findTicketById = async (ticketId: string) => {
    return await ticketRepo.findTicketById(ticketId);
};

export const getMyTickets = async (userId: string) => {
    return await ticketRepo.getMyTickets(userId);
};

export const getHistoryTickets = async (userId: string) => {
    return await ticketRepo.getHistoryTickets(userId);
};

export const resolveTicket = async (ticketId: string, resolverId: string) => {
    const ticketDetails = await findTicketById(ticketId);

    if (!ticketDetails || ticketDetails.length === 0) throw new Error('Ticket not found');

    if (ticketDetails.resolver_id !== resolverId) throw new Error('Not assigned to this resolver');

    if (ticketDetails.status !== 'ASSIGNED') throw new Error('Ticket is not assigned yet');

    const updated = await ticketRepo.changeTicketStatus(ticketId, 'RESOLVED');

    if (!updated) throw new Error('Invalid ticket state');

    await activityService.addActivity(ticketId, resolverId, ActivityTypes.RESOLVED, {});

    return updated;
};

export const verifyResolveStatus = async (ticketId: string, verifierId: string) => {
    const ticketDetails = await findTicketById(ticketId);

    if (!ticketDetails || ticketDetails.length === 0) throw new Error('Ticket not found');

    if (ticketDetails.created_by !== verifierId)
        throw new Error('Ticket is not created by this user');

    if (ticketDetails.status !== 'RESOLVED') throw new Error('Ticket is not resolved yet');

    const updated = await ticketRepo.changeTicketStatus(ticketId, 'VERIFIED');

    if (!updated) throw new Error('Invalid ticket state');

    await activityService.addActivity(ticketId, verifierId, ActivityTypes.VERIFIED, {});

    return updated;
};

export async function closeTicket(ticketId: string, managerId: string) {
    const userDetails = await userService.getUserDetails(managerId);

    if (!userDetails || userDetails.role !== 'MANAGER')
        throw new Error('You do not have permissins');

    const updated = await ticketRepo.changeTicketStatus(ticketId, 'CLOSED');

    if (!updated) throw new Error('Invalid ticket state');

    await activityService.addActivity(ticketId, managerId, ActivityTypes.CLOSED, {});

    return updated;
}

export async function getAssignedTickets(resolverId: string) {
    return ticketRepo.getAssignedTickets(resolverId);
}

export const updatePriority = async (ticketId: string, priority: string, userId: string) => {
    const ticket = await ticketRepo.findTicketById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const updated = await ticketRepo.updateTicketPriority(ticketId, priority);
    
    await activityService.addActivity(ticketId, userId, ActivityTypes.PRIORITY_CHANGED, {
        oldPriority: ticket.priority,
        newPriority: priority
    });

    return updated;
};



export const updateType = async (ticketId: string, type: string, userId: string) => {
    const ticket = await ticketRepo.findTicketById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const updated = await ticketRepo.updateTicketType(ticketId, type);

    await activityService.addActivity(ticketId, userId, ActivityTypes.TYPE_CHANGED, {
        oldType: ticket.type,
        newType: type
    });

    return updated;
};

export const changeStatus = async (ticketId: string, status: string, userId: string) => {
    const ticket = await ticketRepo.findTicketById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const updated = await ticketRepo.changeTicketStatus(ticketId, status);

    await activityService.addActivity(ticketId, userId, ActivityTypes.STATUS_CHANGED, {
        oldStatus: ticket.status,
        newStatus: status
    });

    return updated;
};
