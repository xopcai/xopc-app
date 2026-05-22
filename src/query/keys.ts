export const queryKeys = {
  sessions: ['sessions'] as const,
  session: (key: string) => ['session', key] as const,
  agents: ['agents'] as const,
  models: (agentId?: string) => ['models', agentId ?? ''] as const,
  cronJobs: ['cron', 'jobs'] as const,
  cronRunsHistory: (limit: number) => ['cron', 'runs', limit] as const,
  webchatGoal: (sessionKey: string) => ['webchat', 'goal', sessionKey] as const,
  webchatGoalRuns: (sessionKey: string, limit: number) => ['webchat', 'goal', 'runs', sessionKey, limit] as const,
};
