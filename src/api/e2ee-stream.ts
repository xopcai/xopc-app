import {
  base64UrlToBytes,
  decryptFrame,
  deriveRelayStreamKey,
  encryptEnvelope,
  frameFromBase64,
} from '@xopcai/xopc-e2ee';
import {
  AgentSseLineParser,
  shouldUseXhrForAgentSse,
  type AgentSseCallbacks,
  type AgentSseDispatchOptions,
} from '@xopcai/gateway-sse-client';

import { useGatewayStore } from '../stores/gateway-store';

import { ensureE2eeSession, resolveE2eeSession } from './e2ee-fetch';
import { renewE2eeSession } from './e2ee-handshake';
import {
  bumpE2eeRequestSeq,
  clearE2eeSession,
  persistActiveE2eeSession,
  requiresE2eeTransport,
  type ActiveE2eeSession,
} from './e2ee-session';

export type E2eeRelayStreamResult = {
  ok: boolean;
  status: number;
  /** Local transport teardown (navigate away / abort) — not a server error. */
  aborted?: boolean;
};

export type E2eeRelayStreamInit = {
  method?: string;
  body?: string;
  signal?: AbortSignal;
};

type RelayStreamRequest = {
  session: ActiveE2eeSession;
  requestSeq: number;
  res: Response;
};

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    const msg = err.message.toLowerCase();
    if (msg.includes('abort')) return true;
  }
  return false;
}

async function buildRelayStreamEnvelope(
  session: ActiveE2eeSession,
  path: string,
  init: E2eeRelayStreamInit,
): Promise<{ requestSeq: number; bodyJson: string }> {
  const method = (init.method ?? 'POST').toUpperCase();
  const requestSeq = bumpE2eeRequestSeq(session);
  const envelope = await encryptEnvelope(session.requestKey, requestSeq, init.body ?? '', { method, path });
  const { activeGatewayId, baseUrl } = useGatewayStore.getState();
  if (activeGatewayId || baseUrl) persistActiveE2eeSession(activeGatewayId, baseUrl, session);
  return {
    requestSeq,
    bodyJson: JSON.stringify({
      sessionId: session.sessionId,
      seq: requestSeq,
      method,
      path,
      envelope,
    }),
  };
}

async function postRelayStreamRequest(
  session: ActiveE2eeSession,
  path: string,
  init: E2eeRelayStreamInit,
): Promise<RelayStreamRequest> {
  const { token, apiUrl } = useGatewayStore.getState();
  const { requestSeq, bodyJson } = await buildRelayStreamEnvelope(session, path, init);

  const res = await fetch(apiUrl('/api/e2ee/relay-stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: bodyJson,
    signal: init.signal,
  });

  return { session, requestSeq, res };
}

async function renewSessionAndRetryRelayStream(
  session: ActiveE2eeSession,
  path: string,
  init: E2eeRelayStreamInit,
): Promise<RelayStreamRequest> {
  const { token, baseUrl, activeGatewayId, activeBaseUrl } = useGatewayStore.getState();
  const origin = baseUrl || activeBaseUrl;
  clearE2eeSession(activeGatewayId, origin);
  await renewE2eeSession({ origin, token, gatewayId: activeGatewayId, baseUrl: origin });
  const renewed = (await resolveE2eeSession()) ?? session;
  return postRelayStreamRequest(renewed, path, init);
}

async function drainEncryptedSseBuffer(
  streamKey: CryptoKey,
  buffer: string,
  localFrameSeq: { value: number },
  onPlaintext: (plain: string) => void,
): Promise<string> {
  let pending = buffer;
  while (pending.includes('\n\n')) {
    const idx = pending.indexOf('\n\n');
    const block = pending.slice(0, idx);
    pending = pending.slice(idx + 2);
    const dataLine = block
      .split('\n')
      .find((line) => line.startsWith('data:'))
      ?.replace(/^data:\s?/, '')
      .trim();
    if (!dataLine) continue;

    localFrameSeq.value += 1;
    const plain = await decryptFrame(streamKey, localFrameSeq.value, frameFromBase64(dataLine));
    onPlaintext(plain);
  }
  return pending;
}

async function decryptE2eeRelayStreamFrames(
  session: ActiveE2eeSession,
  requestSeq: number,
  res: Response,
  init: E2eeRelayStreamInit,
  onPlaintext: (plain: string) => void,
): Promise<void> {
  if (init.signal?.aborted) return;

  const rootKey = base64UrlToBytes(session.rootKey);
  const streamKey = await deriveRelayStreamKey(rootKey, requestSeq);
  const localFrameSeq = { value: 0 };

  if (!res.body) {
    const text = await res.text();
    if (!text.trim()) {
      if (init.signal?.aborted) return;
      throw new Error('E2EE stream relay returned an empty body');
    }
    await drainEncryptedSseBuffer(streamKey, text, localFrameSeq, onPlaintext);
    persistSessionAfterStream(session);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = await drainEncryptedSseBuffer(streamKey, buffer, localFrameSeq, onPlaintext);
    }
  } catch (err) {
    if (init.signal?.aborted || isAbortError(err)) return;
    throw err;
  }

  persistSessionAfterStream(session);
}

function persistSessionAfterStream(session: ActiveE2eeSession): void {
  const { activeGatewayId, baseUrl } = useGatewayStore.getState();
  if (activeGatewayId || baseUrl) persistActiveE2eeSession(activeGatewayId, baseUrl, session);
}

/**
 * React Native `fetch().body` is often null for SSE — use XHR incremental parse (same as LAN agent SSE).
 */
async function consumeE2eeRelayStreamViaXhr(
  session: ActiveE2eeSession,
  path: string,
  init: E2eeRelayStreamInit,
  onPlaintext: (plain: string) => void,
): Promise<E2eeRelayStreamResult> {
  const { token, apiUrl } = useGatewayStore.getState();
  const { requestSeq, bodyJson } = await buildRelayStreamEnvelope(session, path, init);
  const rootKey = base64UrlToBytes(session.rootKey);
  const streamKey = await deriveRelayStreamKey(rootKey, requestSeq);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/e2ee/relay-stream'), true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    let parsedLen = 0;
    let buffer = '';
    const localFrameSeq = { value: 0 };
    let settled = false;
    let drainChain: Promise<void> = Promise.resolve();

    const finish = (result: E2eeRelayStreamResult) => {
      if (settled) return;
      settled = true;
      init.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      init.signal?.removeEventListener('abort', onAbort);
      reject(err);
    };

    const queueDrain = () => {
      drainChain = drainChain
        .then(async () => {
          const text = xhr.responseText;
          if (text.length <= parsedLen) return;
          buffer += text.slice(parsedLen);
          parsedLen = text.length;
          buffer = await drainEncryptedSseBuffer(streamKey, buffer, localFrameSeq, onPlaintext);
        })
        .catch((err) => {
          if (!init.signal?.aborted && !isAbortError(err)) fail(err instanceof Error ? err : new Error(String(err)));
        });
    };

    const onAbort = () => {
      xhr.abort();
    };

    if (init.signal?.aborted) {
      finish({ ok: false, status: 0, aborted: true });
      return;
    }
    init.signal?.addEventListener('abort', onAbort);

    xhr.onprogress = queueDrain;

    xhr.onload = () => {
      void drainChain.then(async () => {
        queueDrain();
        await drainChain;
        persistSessionAfterStream(session);
        const contentType = xhr.getResponseHeader('Content-Type') ?? '';
        const isSse = contentType.includes('text/event-stream');
        finish({
          ok: xhr.status >= 200 && xhr.status < 300 && isSse,
          status: xhr.status,
        });
      });
    };

    xhr.onerror = () => {
      if (init.signal?.aborted) {
        finish({ ok: false, status: 0, aborted: true });
        return;
      }
      fail(new Error('Network request failed'));
    };

    xhr.onabort = () => {
      finish({ ok: false, status: 0, aborted: true });
    };

    xhr.send(bodyJson);
  });
}

/**
 * Generic E2EE relay-stream consumer — decrypts frames and feeds plaintext chunks to the caller.
 * Each relay-stream uses an independent stream key (derived from request seq) so broadcast
 * `/api/events` and agent `/api/agent` can run concurrently on FRP.
 */
export async function consumeE2eeRelayStream(
  path: string,
  init: E2eeRelayStreamInit,
  onPlaintext: (plain: string) => void,
): Promise<E2eeRelayStreamResult> {
  let session = await ensureE2eeSession();

  if (shouldUseXhrForAgentSse()) {
    let result = await consumeE2eeRelayStreamViaXhr(session, path, init, onPlaintext);
    if (result.aborted) return result;
    if (result.status === 401) {
      const { token, baseUrl, activeGatewayId, activeBaseUrl } = useGatewayStore.getState();
      const origin = baseUrl || activeBaseUrl;
      clearE2eeSession(activeGatewayId, origin);
      await renewE2eeSession({ origin, token, gatewayId: activeGatewayId, baseUrl: origin });
      session = (await resolveE2eeSession()) ?? session;
      result = await consumeE2eeRelayStreamViaXhr(session, path, init, onPlaintext);
    }
    return result;
  }

  let { requestSeq, res } = await postRelayStreamRequest(session, path, init);

  if (res.status === 401) {
    ({ session, requestSeq, res } = await renewSessionAndRetryRelayStream(session, path, init));
  }

  if (init.signal?.aborted) {
    return { ok: false, status: 0, aborted: true };
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    return { ok: false, status: res.status };
  }

  try {
    await decryptE2eeRelayStreamFrames(session, requestSeq, res, init, onPlaintext);
  } catch (err) {
    if (init.signal?.aborted || isAbortError(err)) {
      return { ok: false, status: 0, aborted: true };
    }
    throw err;
  }
  return { ok: true, status: 200 };
}

/**
 * Agent SSE over E2EE relay-stream — decrypts frames and feeds the shared SSE parser.
 */
export async function consumeE2eeRelayAgentSse(
  path: string,
  init: E2eeRelayStreamInit,
  callbacks: AgentSseCallbacks | undefined,
  options?: AgentSseDispatchOptions,
): Promise<E2eeRelayStreamResult> {
  const parser = new AgentSseLineParser(callbacks, options);
  const result = await consumeE2eeRelayStream(path, init, (plain) => parser.feed(plain));
  if (!result.aborted) parser.flush();
  return result;
}

export async function shouldUseE2eeStream(): Promise<boolean> {
  const { activeBaseUrl, baseUrl } = useGatewayStore.getState();
  return requiresE2eeTransport(activeBaseUrl || baseUrl);
}
