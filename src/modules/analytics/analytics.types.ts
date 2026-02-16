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

// System Admin Analytics

export interface SystemOrgStats {
    totalOrgs: number;
    totalUsers: number;
    totalProjects: number;
    activeUsers: number;
    inactiveUsers: number;
}

export interface OrgMemberDistribution {
    id: string;
    name: string;
    slug: string;
    memberCount: number;
}

export interface OrgTimelineData {
    date: string;
    count: number;
}

export interface RoleDistribution {
    role: string;
    count: number;
}

export interface SystemAdminAnalytics {
    stats: SystemOrgStats;
    memberDistribution: OrgMemberDistribution[];
    orgTimeline: OrgTimelineData[];
    roleDistribution: RoleDistribution[];
}

// PROJECT_MANAGER Analytics Types

export interface TeamPerformanceMetric {
    agentId: string;
    agentName: string;
    resolved: number;
    inProgress: number;
    assigned: number;
    avgResolutionDays: number;
}

export interface WorkloadDistribution {
    agentId: string;
    agentName: string;
    assigned: number;
    inProgress: number;
    total: number;
}

export interface TicketAgingBucket {
    ageBucket: '0-2 days' | '3-7 days' | '7+ days';
    count: number;
}

export interface InflowOutflowData {
    date: string;
    inflow: number;
    outflow: number;
}

export interface ProjectManagerAnalytics {
    teamPerformance: TeamPerformanceMetric[];
    workloadDistribution: WorkloadDistribution[];
    agingBuckets: TicketAgingBucket[];
    inflowOutflow: InflowOutflowData[];
}

// AGENT Analytics Types

export interface AgentProductivityStats {
    resolvedToday: number;
    resolvedThisWeek: number;
    assigned: number;
    inProgress: number;
}

export interface AgentVelocityTrend {
    date: string;
    resolved: number;
}

export interface AgentResolutionTime {
    resolvedCount: number;
    avgDays: number;
}

export interface AgentAnalytics {
    productivity: AgentProductivityStats;
    velocityTrend: AgentVelocityTrend[];
    resolutionTime: AgentResolutionTime;
    inflowOutflow: InflowOutflowData[];
}

// REQUESTER Analytics Types

export interface RequesterTurnaroundTime {
    completedTickets: number;
    avgTurnaroundDays: number;
}

export interface RequesterActivity {
    id: string;
    type: string;
    ticketId: string;
    ticketTitle: string;
    performedBy: string;
    performedByName: string;
    metadata: any;
    createdAt: string;
}

export interface TicketStats {
    openTickets: number;
    inProgressTickets: number;
    resolvedTickets: number;
    closedTickets: number;
    totalTickets: number;
}

export interface RequesterAnalytics {
    stats: TicketStats;
    turnaroundTime: RequesterTurnaroundTime;
    recentActivity: RequesterActivity[];
}

// ORG_OWNER Analytics Types

export interface CrossProjectPerformance {
    projectId: string;
    projectName: string;
    totalTickets: number;
    open: number;
    resolved: number;
    avgResolutionDays: number;
    activeAgents: number;
}

export interface TopPerformer {
    userId: string;
    userName: string;
    ticketsResolved: number;
    avgResolutionDays: number;
}

export interface BottleneckAnalysis {
    projectId: string;
    projectName: string;
    staleTickets: number;
    unassignedTickets: number;
    avgOpenAge: number;
}

export interface OrgOwnerAnalytics {
    crossProjectPerformance: CrossProjectPerformance[];
    topPerformers: TopPerformer[];
    bottleneckAnalysis: BottleneckAnalysis[];
    orgStats: TicketStats;
}
