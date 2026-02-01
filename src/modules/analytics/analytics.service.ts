import * as analyticsRepository from './analytics.repository';
import { UserAnalyticsResponse, TicketStatusSummary, ManagerAnalyticsResponse, AdminAnalyticsResponse, ResolverAnalyticsResponse } from './analytics.types';

export const getUserAnalytics = async (userId: string): Promise<UserAnalyticsResponse> => {
    const [statusStats, creationStats, rawAvgTime] = await Promise.all([
        analyticsRepository.getTicketStatusStats(userId),
        analyticsRepository.getTicketCreationStats(userId),
        analyticsRepository.getRawAverageResolutionTime(userId)
    ]);

    // Process Status Summary
    const summary: TicketStatusSummary = {
        OPEN: 0,
        ASSIGNED: 0,
        RESOLVED: 0,
        VERIFIED: 0,
        CLOSED: 0,
        TOTAL: 0
    };

    statusStats.forEach((row: any) => {
        if (Object.prototype.hasOwnProperty.call(summary, row.status)) {
            // @ts-ignore
            summary[row.status] = row.count;
        }
    });

    summary.TOTAL = 
        summary.OPEN + 
        summary.ASSIGNED + 
        summary.RESOLVED + 
        summary.VERIFIED + 
        summary.CLOSED;

    // Process Creation Trend
    const formattedTrend = creationStats.map((item: any) => {
        const dateObj = new Date(item.day);
        // Helper to format date in YYYY-MM-DD using local time
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return {
            day: `${year}-${month}-${day}`,
            count: item.count
        };
    });

    // Process Average Resolution Time
    const avgSeconds = parseFloat(rawAvgTime?.avg_seconds);
    const avgResTimeMs = isNaN(avgSeconds) ? 0 : avgSeconds * 1000;

    // Format average resolution time
    const formatDuration = (ms: number): string => {
        if (ms === 0) return '0h 0m';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        }
        return `${hours}h ${minutes % 60}m`;
    };

    return {
        statusSummary: summary,
        creationTrend: formattedTrend,
        averageResolutionTime: formatDuration(avgResTimeMs)
    };
};

export const getManagerAnalytics = async (): Promise<ManagerAnalyticsResponse> => {
    const [
        statusSummary,
        ticketsPerResolver,
        dailyTrend,
        performance,
        agingBuckets
    ] = await Promise.all([
        analyticsRepository.getManagerTicketStatusSummary(),
        analyticsRepository.getTicketsPerResolver(),
        analyticsRepository.getDailyTicketTrend(),
        analyticsRepository.getResolverPerformance(),
        analyticsRepository.getTicketAgingBuckets()
    ]);

    // Format Daily Trend Dates
    const formattedTrend = dailyTrend.map((item: any) => {
        const dateObj = new Date(item.day);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return {
            day: `${year}-${month}-${day}`,
            count: item.count
        };
    });

    // Format Performance Metrics (ensure numbers)
    const formattedPerformance = performance.map((item: any) => ({
        resolverId: item.resolverId,
        resolverName: item.resolverName,
        avgResolutionDays: parseFloat(item.avgResolutionDays) || 0
    }));

    const formattedStatusSummary = {
        open: parseInt(statusSummary.open),
        assigned: parseInt(statusSummary.assigned),
        resolved: parseInt(statusSummary.resolved),
        verified: parseInt(statusSummary.verified),
        closed: parseInt(statusSummary.closed),
        total: parseInt(statusSummary.total)
    };

    // Sort aging buckets
    const bucketOrder = {
        '0–2 days': 1,
        '3–7 days': 2,
        '7+ days': 3
    };

    const sortedAgingBuckets = agingBuckets.sort((a: any, b: any) => {
        // @ts-ignore
        return (bucketOrder[a.range] || 99) - (bucketOrder[b.range] || 99);
    });

    return {
        statusSummary: formattedStatusSummary,
        ticketsPerResolver,
        dailyTicketTrend: formattedTrend,
        resolverPerformance: formattedPerformance,
        agingBuckets: sortedAgingBuckets
    };
};

export const getAdminAnalytics = async (): Promise<AdminAnalyticsResponse> => {
    const [
        usersByRole,
        activeUsers,
        signups,
        ticketSummary,
        heatmap
    ] = await Promise.all([
        analyticsRepository.getUsersByRole(),
        analyticsRepository.getActiveUserStats(),
        analyticsRepository.getSignupTrend(),
        analyticsRepository.getTicketSummary(),
        analyticsRepository.getSystemActivityHeatmap()
    ]);

    // Format Signup Trend
    const formattedSignups = signups.map((item: any) => {
        const dateObj = new Date(item.day);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return {
            day: `${year}-${month}-${day}`,
            count: item.count
        };
    });

    return {
        usersByRole,
        activeUsers: {
            active: parseInt(activeUsers.active),
            inactive: parseInt(activeUsers.inactive)
        },
        signups: formattedSignups,
        ticketSummary: {
            totalTickets: parseInt(ticketSummary.totalTickets)
        },
        systemActivityHeatmap: heatmap
    };
};

export const getResolverAnalytics = async (resolverId: string): Promise<ResolverAnalyticsResponse> => {
    const [
        workload,
        trend,
        inflowOutflow,
        avgTime
    ] = await Promise.all([
        analyticsRepository.getResolverWorkload(resolverId),
        analyticsRepository.getResolverResolutionTrend(resolverId),
        analyticsRepository.getResolverInflowOutflow(resolverId),
        analyticsRepository.getResolverAvgResolutionTime(resolverId)
    ]);

    // Helper formatter
    const formatDate = (dateString: string) => {
        const dateObj = new Date(dateString);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formattedTrend = trend.map((item: any) => ({
        day: formatDate(item.day),
        resolved: item.resolved
    }));

    const formattedInflowOutflow = inflowOutflow.map((item: any) => ({
        day: formatDate(item.day),
        inflow: item.inflow,
        outflow: item.outflow
    }));

    return {
        workload: {
            assigned: parseInt(workload.assigned),
            inProgress: parseInt(workload.inProgress),
            resolvedToday: parseInt(workload.resolvedToday)
        },
        resolutionTrend: formattedTrend,
        inflowOutflow: formattedInflowOutflow,
        avgResolutionDays: parseFloat(avgTime?.avgDays) || 0
    };
};
