import * as ticketRepo from './tickets.repository';
import * as userService from '../users/user.service';
import * as activityService from '../activity/activity.service';
import { ActivityTypes } from '../activity/activity.types';

export const createTicket = async (userId: string, data: { title: string; description: string }) => {
    const ticket = await ticketRepo.createTicket({
        title: data.title,
        description: data.description,
        createdBy: userId,
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

    if (ticketDetails.resolverId !== resolverId) throw new Error('Not assigned to this resolver');

    if (ticketDetails.status !== 'ASSIGNED') throw new Error('Ticket is not assigned yet');

    const updated = await ticketRepo.changeTicketStatus(ticketId, 'RESOLVED');

    if (!updated) throw new Error('Invalid ticket state');

    await activityService.addActivity(ticketId, resolverId, ActivityTypes.RESOLVED, {});

    return updated;
};

export const verifyResolveStatus = async (ticketId: string, verifierId: string) => {
    const ticketDetails = await findTicketById(ticketId);

    if (!ticketDetails || ticketDetails.length === 0) throw new Error('Ticket not found');

    if (ticketDetails.createdBy !== verifierId)
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
