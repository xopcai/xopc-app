import { queryKeys } from '../query/keys';
import { queryClient } from '../query/query-client';
import { useGatewayStore } from '../stores/gateway-store';
import { requiresE2eeTransport } from './e2ee-transport';
import { e2eeRelayFetch, shouldUseE2eeFetch } from './e2ee-fetch';

export function formatApiHttpError(status: number, statusText: string, message?: string): string {
  const m = message?.trim();
  if (m) return `${status} ${statusText}: ${m}`;
  return `${status} ${statusText}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { token, apiUrl, activeBaseUrl, baseUrl, onUnauthorized } = useGatewayStore.getState();
  const routeUrl = activeBaseUrl || baseUrl;
  if (requiresE2eeTransport(routeUrl)) {
    if (!(await shouldUseE2eeFetch())) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              'E2EE session required for remote tunnel. Scan the gateway QR again or wait for reconnect.',
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const res = await e2eeRelayFetch(path, init);
    if (res.status === 401) {
      onUnauthorized();
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    }
    return res;
  }

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
