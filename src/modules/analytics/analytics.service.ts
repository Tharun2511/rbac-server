import * as analyticsRepo from './analytics.repository';

export const getOrgAnalytics = async (orgId?: string, projectId?: string) => {
    const stats = await analyticsRepo.getTicketStats(orgId, undefined, projectId);
    const byPriority = await analyticsRepo.getTicketsByPriority(orgId, projectId);
    const byStatus = await analyticsRepo.getTicketsByStatus(orgId, projectId);
    
    return {
        stats,
        byPriority,
        byStatus
    };
};

export const getMyAnalytics = async (orgId: string | undefined, userId: string) => {
    const stats = await analyticsRepo.getTicketStats(orgId, userId);
    return { stats };
};
