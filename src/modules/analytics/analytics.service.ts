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

export const getSystemAdminAnalytics = async () => {
    const stats = await analyticsRepo.getSystemOrgStats();
    const memberDistribution = await analyticsRepo.getMemberDistribution();
    const orgTimeline = await analyticsRepo.getOrgCreationTimeline();
    const roleDistribution = await analyticsRepo.getRoleDistribution();

    return {
        stats,
        memberDistribution,
        orgTimeline,
        roleDistribution
    };
};

export const getProjectManagerAnalytics = async (projectId: string) => {
    const teamPerformance = await analyticsRepo.getTeamPerformanceMetrics(projectId);
    const workloadDistribution = await analyticsRepo.getTeamWorkloadDistribution(projectId);
    const agingBuckets = await analyticsRepo.getTicketAgingBuckets(projectId);
    const inflowOutflow = await analyticsRepo.getInflowOutflowTrend(projectId);
    const typeDistribution = await analyticsRepo.getTicketTypeDistribution(projectId);

    return {
        teamPerformance,
        workloadDistribution,
        agingBuckets,
        inflowOutflow,
        typeDistribution
    };
};

export const getAgentAnalytics = async (userId: string, orgId: string) => {
    const productivity = await analyticsRepo.getAgentProductivity(userId, orgId);
    const velocityTrend = await analyticsRepo.getAgentVelocityTrend(userId, orgId);
    const resolutionTime = await analyticsRepo.getAgentAvgResolutionTime(userId, orgId);
    const inflowOutflow = await analyticsRepo.getAgentInflowOutflow(userId, orgId);
    const tasksDue = await analyticsRepo.getMyTasksDue(userId, orgId);

    return {
        productivity,
        velocityTrend,
        resolutionTime,
        inflowOutflow,
        tasksDue
    };
};

export const getRequesterAnalytics = async (userId: string, orgId: string) => {
    const stats = await analyticsRepo.getTicketStats(orgId, userId);
    const turnaroundTime = await analyticsRepo.getRequesterTurnaroundTime(userId, orgId);
    const recentActivity = await analyticsRepo.getRequesterRecentActivity(userId, orgId);

    return {
        stats,
        turnaroundTime,
        recentActivity
    };
};

export const getOrgOwnerAnalytics = async (orgId: string) => {
    const crossProjectPerformance = await analyticsRepo.getCrossProjectPerformance(orgId);
    const topPerformers = await analyticsRepo.getOrgTopPerformers(orgId);
    const bottleneckAnalysis = await analyticsRepo.getBottleneckAnalysis(orgId);
    const orgStats = await analyticsRepo.getTicketStats(orgId);
    const slaCompliance = await analyticsRepo.getSLACompliance(orgId);
    const resourceAllocation = await analyticsRepo.getResourceAllocation(orgId);

    return {
        crossProjectPerformance,
        topPerformers,
        bottleneckAnalysis,
        orgStats,
        slaCompliance,
        resourceAllocation
    };
};
