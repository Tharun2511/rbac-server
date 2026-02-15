import * as commentRepo from './comments.repository';
import * as ticketService from '../tickets/tickets.service';

export const createComment = async (ticketId: string, userId: string, comment: string, orgId: string) => {
    // Verify ticket existence and access (scoped to org)
    await ticketService.getTicketById(ticketId, orgId);

    return await commentRepo.createComment({
        ticketId,
        userId,
        comment,
    });
};

export const getCommentsByTicketId = async (ticketId: string, orgId: string) => {
    // Verify ticket existence and access
    await ticketService.getTicketById(ticketId, orgId);

    return await commentRepo.getCommentsByTicketId(ticketId);
};
