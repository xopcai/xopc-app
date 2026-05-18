/**
 * Gateway cron API — mirrors xopc `src/gateway/hono/routes/cron.ts` and web `cron-api.ts`.
 */
import { apiFetch, formatApiHttpError } from '../api/client';

export type CronPayload = {
  kind?: 'systemEvent' | 'agentTurn';
  text?: string;
  message?: string;
};

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

function encId(id: string): string {
  return encodeURIComponent(id);
}

function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function apiErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const data = await parseJson(res);
  throw new Error(formatApiHttpError(res.status, res.statusText, apiErrorMessage(data)));
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
  const payload = job.payload;
  if (!payload) return '';
  if (payload.kind === 'systemEvent') return (payload.text ?? '').trim();
  return (payload.message ?? '').trim();
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

export async function toggleCronJob(id: string, enabled: boolean): Promise<void> {
  const res = await apiFetch(`/api/cron/${encId(id)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
  await throwIfNotOk(res);
}

export async function runCronJobNow(id: string): Promise<void> {
  const res = await apiFetch(`/api/cron/${encId(id)}/run`, { method: 'POST' });
  await throwIfNotOk(res);
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
