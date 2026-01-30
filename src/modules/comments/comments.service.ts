import * as commentRepo from './comments.repository';
import * as ticketService from '../tickets/tickets.service';

export const createComment = async (ticketId: string, userId: string, comment: string) => {
    const ticket = await ticketService.findTicketById(ticketId);

    if (!ticket) {
        throw new Error('Ticket not found');
    }

    return await commentRepo.createComment({
        ticketId,
        userId,
        comment,
    });
};

export const getCommentsByTicketId = async (ticketId: string) => {
    // We might want to check if ticket exists here too
    const ticket = await ticketService.findTicketById(ticketId);

    if (!ticket) {
        throw new Error('Ticket not found');
    }

    return await commentRepo.getCommentsByTicketId(ticketId);
};
