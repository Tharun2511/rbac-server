import * as ticketRepo from './tickets.repository';
import * as userService from '../users/user.service';

export const createTicket = (userId: string, data: { title: string; description: string }) => {
    return ticketRepo.createTicket({
        title: data.title,
        description: data.description,
        createdBy: userId,
    });
};

export const assignTicket = async (ticketId: string, resolverId: string) => {
    const ticket = await ticketRepo.assignTicket(ticketId, resolverId);

    if (!ticket) {
        throw new Error('Ticket not in OPEN state');
    }

    return ticket;
};

export const findTicketById = async (ticketId: string) => {
    return await ticketRepo.findTicketById(ticketId);
};

export const resolveTicket = async (ticketId: string, resolverId: string) => {
    const ticketDetails = await findTicketById(ticketId);

    if (!ticketDetails || ticketDetails.length === 0) throw new Error('Ticket not found');

    if (ticketDetails.assigned_to !== resolverId) throw new Error('Not assigned to this resolver');

    if (ticketDetails.status !== 'ASSIGNED') throw new Error('Ticket is not assigned yet');

    const updated = await ticketRepo.changeTicketStatus(ticketId, 'RESOLVED');

    if (!updated) throw new Error('Invalid ticket state');

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

    return updated;
};

export async function closeTicket(ticketId: string, managerId: string) {
    const userDetails = await userService.getUserDetails(managerId);

    if (!userDetails || userDetails.role !== 'MANAGER')
        throw new Error('You do not have permissins');

    const updated = await ticketRepo.changeTicketStatus(ticketId, 'CLOSED');

    if (!updated) throw new Error('Invalid ticket state');

    return updated;
}
