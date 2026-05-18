export const queryKeys = {
  sessions: ['sessions'] as const,
  session: (key: string) => ['session', key] as const,
  agents: ['agents'] as const,
  cronJobs: ['cron', 'jobs'] as const,
  cronRunsHistory: (limit: number) => ['cron', 'runs', limit] as const,
};
