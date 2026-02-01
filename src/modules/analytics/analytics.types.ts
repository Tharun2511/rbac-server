export interface TicketStatusSummary {
    OPEN: number;
    ASSIGNED: number;
    RESOLVED: number;
    VERIFIED: number;
    CLOSED: number;
    TOTAL: number;
}

export interface TicketCreationTrend {
    day: string;
    count: number;
}

export interface UserAnalyticsResponse {
    statusSummary: TicketStatusSummary;
    creationTrend: TicketCreationTrend[];
    averageResolutionTime: string;
}

export interface ManagerTicketStatusSummary {
    open: number;
    assigned: number;
    resolved: number;
    verified: number;
    closed: number;
    total: number;
}

export interface TicketPerResolver {
    resolverId: string;
    resolverName: string;
    ticketCount: number;
}

export interface DailyTicketTrend {
    day: string;
    count: number;
}

export interface ResolverPerformance {
    resolverId: string;
    resolverName: string;
    avgResolutionDays: number;
}

export interface TicketAgingBucket {
    range: '0–2 days' | '3–7 days' | '7+ days';
    count: number;
}

export interface ManagerAnalyticsResponse {
    statusSummary: ManagerTicketStatusSummary;
    ticketsPerResolver: TicketPerResolver[];
    dailyTicketTrend: DailyTicketTrend[];
    resolverPerformance: ResolverPerformance[];
    agingBuckets: TicketAgingBucket[];
}

export interface UserByRole {
    role: string;
    count: number;
}

export interface ActiveUsers {
    active: number;
    inactive: number;
}

export interface SignupTrend {
    day: string;
    count: number;
}

export interface AdminTicketSummary {
    totalTickets: number;
}

export interface SystemActivityHeatmap {
    day: string;
    hour: number;
    count: number;
}

export interface AdminAnalyticsResponse {
    usersByRole: UserByRole[];
    activeUsers: ActiveUsers;
    signups: SignupTrend[];
    ticketSummary: AdminTicketSummary;
    systemActivityHeatmap: SystemActivityHeatmap[];
}

export interface ResolverWorkload {
    assigned: number;
    inProgress: number; // Placeholder, likely 0 or same as assigned depending on logic
    resolvedToday: number;
}

export interface ResolutionTrend {
    day: string;
    resolved: number;
}

export interface InflowOutflow {
    day: string;
    inflow: number;
    outflow: number;
}

export interface ResolverAnalyticsResponse {
    workload: ResolverWorkload;
    resolutionTrend: ResolutionTrend[];
    inflowOutflow: InflowOutflow[];
    avgResolutionDays: number;
}
