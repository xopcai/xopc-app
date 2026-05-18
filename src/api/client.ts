import { queryKeys } from '../query/keys';
import { queryClient } from '../query/query-client';
import { useGatewayStore } from '../stores/gateway-store';

export function formatApiHttpError(status: number, statusText: string, message?: string): string {
  const m = message?.trim();
  if (m) return `${status} ${statusText}: ${m}`;
  return `${status} ${statusText}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { token, apiUrl, onUnauthorized } = useGatewayStore.getState();
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body != null && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (res.status === 401) {
    onUnauthorized();
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
  }

  return res;
}

export function notifyUnauthorizedIfNeeded(status: number): void {
  if (status !== 401) return;
  const { onUnauthorized } = useGatewayStore.getState();
  onUnauthorized();
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
}

export function buildAgentSseHeaders(): Record<string, string> {
  const { token } = useGatewayStore.getState();
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
