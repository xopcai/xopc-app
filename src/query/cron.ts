/**
 * Gateway cron API — mirrors xopc `src/gateway/hono/routes/cron.ts` and web `cron-api.ts`.
 *
 * Endpoints:
 *   GET  /api/cron
 *   GET  /api/cron/runs/history?limit=
 */
import { apiFetch, formatApiHttpError } from '../api/client';

export type CronPayload = {
  kind?: 'systemEvent' | 'agentTurn';
  text?: string;
  message?: string;
};

/** Job row from GET /api/cron (subset used by mobile). */
export type CronJobRow = {
  id: string;
  name?: string;
  schedule: string;
  enabled: boolean;
  timezone?: string;
  next_run?: string;
  payload?: CronPayload;
};

export type CronRunRow = {
  id: string;
  jobId: string;
  jobName?: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  duration?: number;
  error?: string;
  summary?: string;
};

function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function isCronJobRow(x: unknown): x is CronJobRow {
  if (x == null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.schedule === 'string' && typeof o.enabled === 'boolean';
}

function isCronRunRow(x: unknown): x is CronRunRow {
  if (x == null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const status = o.status;
  return (
    typeof o.id === 'string' &&
    typeof o.jobId === 'string' &&
    typeof o.startedAt === 'string' &&
    (status === 'running' || status === 'success' || status === 'failed' || status === 'cancelled')
  );
}

export function cronJobPromptPreview(job: Pick<CronJobRow, 'payload'>): string {
  const p = job.payload;
  if (!p) return '';
  if (p.kind === 'systemEvent') return (p.text ?? '').trim();
  return (p.message ?? '').trim();
}

function apiErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const e = (data as { error?: unknown }).error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return undefined;
}

export async function fetchCronJobs(): Promise<CronJobRow[]> {
  const res = await apiFetch('/api/cron');
  const data = (await parseJson(res)) as { jobs?: unknown };
  if (!res.ok) {
    throw new Error(formatApiHttpError(res.status, res.statusText, apiErrorMessage(data)));
  }
  if (!Array.isArray(data.jobs)) return [];
  return data.jobs.filter(isCronJobRow);
}

export async function fetchCronRunsHistory(limit = 50): Promise<CronRunRow[]> {
  const q = encodeURIComponent(String(limit));
  const res = await apiFetch(`/api/cron/runs/history?limit=${q}`);
  const data = (await parseJson(res)) as { runs?: unknown };
  if (!res.ok) {
    throw new Error(formatApiHttpError(res.status, res.statusText, apiErrorMessage(data)));
  }
  if (!Array.isArray(data.runs)) return [];
  return data.runs.filter(isCronRunRow);
}
