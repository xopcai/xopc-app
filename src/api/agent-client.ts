import {
  consumeAgentSseResponse,
  consumeAgentSseXhr,
  isEventStreamResponse,
  shouldUseXhrForAgentSse,
  type AgentSseCallbacks,
  type AgentSseDispatchOptions,
} from '@xopcai/gateway-sse-client';

import {
  apiFetch,
  buildAgentSseHeaders,
  buildAgentSseMultipartHeaders,
  formatApiHttpError,
  notifyUnauthorizedIfNeeded,
} from './client';
import { capAttachments } from '../features/chat/chat-limits';
import type { WireAttachment } from '../features/chat/composer.types';
import { useGatewayStore } from '../stores/gateway-store';
import { pendingRunStorageKey, storage } from '../storage/mmkv';

export type MessagingCallbacks = AgentSseCallbacks;

export type VoiceMessagePayload = {
  uri: string;
  durationMillis: number;
  mimeType?: string;
  name?: string;
};

export async function submitClarifyResponse(
  requestId: string,
  payload: { answer: string } | { skip: true },
): Promise<void> {
  const res = await apiFetch(`/api/clarify/${encodeURIComponent(requestId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(formatApiHttpError(res.status, res.statusText, body.error?.message));
  }
}

function wrapTerminalCallbacks(cb?: MessagingCallbacks): {
  wrapped: MessagingCallbacks | undefined;
  sawTerminal: boolean;
  onMissingTerminal: () => void;
} {
  if (!cb) {
    return { wrapped: undefined, sawTerminal: false, onMissingTerminal: () => {} };
  }
  let sawTerminal = false;
  const markTerminal = () => {
    sawTerminal = true;
  };
  return {
    get sawTerminal() {
      return sawTerminal;
    },
    wrapped: {
      ...cb,
      onResult: () => {
        if (sawTerminal) return;
        markTerminal();
        cb.onResult();
      },
      onError: (msg: string) => {
        if (sawTerminal) return;
        markTerminal();
        cb.onError(msg);
      },
    },
    onMissingTerminal: () => {
      if (sawTerminal) return;
      markTerminal();
      cb.onResult();
    },
  };
}

function sseDispatchOptions(sseChatId: string): AgentSseDispatchOptions {
  return {
    sseChatId,
    savePendingRunId: (chatId, runId) => {
      storage.set(pendingRunStorageKey(chatId), JSON.stringify({ runId }));
    },
  };
}

/**
 * Streams agent output from `POST /api/agent` (and resume), matching the web gateway console.
 */
export class AgentMessageSender {
  private _abort?: AbortController;
  private _sseChatId = '';

  get isSending() {
    return !!this._abort;
  }

  async send(
    path: string,
    body: Record<string, unknown>,
    callbacks?: MessagingCallbacks,
  ): Promise<void> {
    this._abort = new AbortController();
    const abortController = this._abort;
    const chatId = typeof body.chatId === 'string' ? body.chatId : typeof body.sessionKey === 'string' ? body.sessionKey : '';
    this._sseChatId = chatId;

    const mergedBody = {
      ...body,
      channel: 'webchat',
    };
    const bodyJson = JSON.stringify(mergedBody);
    const terminal = wrapTerminalCallbacks(callbacks);
    const opts = sseDispatchOptions(this._sseChatId);

    try {
      if (shouldUseXhrForAgentSse()) {
        const result = await consumeAgentSseXhr(
          useGatewayStore.getState().apiUrl(path),
          {
            method: 'POST',
            headers: buildAgentSseHeaders(),
            body: bodyJson,
            signal: abortController.signal,
          },
          terminal.wrapped,
          opts,
        );
        notifyUnauthorizedIfNeeded(result.status);
        if (!result.ok) {
          const errBody = parseApiErrorBody(result.responseText);
          throw new Error(formatApiHttpError(result.status, result.statusText, errBody));
        }
      } else {
        const res = await apiFetch(path, {
          method: 'POST',
          headers: { Accept: 'text/event-stream' },
          body: bodyJson,
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(formatApiHttpError(res.status, res.statusText, errBody.error?.message));
        }

        await Promise.resolve();

        if (isEventStreamResponse(res)) {
          await consumeAgentSseResponse(res, terminal.wrapped, opts);
        } else {
          const json = (await res.json()) as { ok?: boolean; payload?: { content?: string } };
          if (json.ok && json.payload?.content) {
            callbacks?.onToken(json.payload.content);
            callbacks?.onResult();
          }
        }
      }

      if (!terminal.sawTerminal && !abortController.signal.aborted) {
        terminal.onMissingTerminal();
      }
    } finally {
      this._clearPendingRun();
      if (this._abort === abortController) {
        this._abort = undefined;
      }
    }
  }

  async sendMultipart(
    path: string,
    formData: FormData,
    sessionKey: string,
    callbacks?: MessagingCallbacks,
  ): Promise<void> {
    this._abort = new AbortController();
    const abortController = this._abort;
    this._sseChatId = sessionKey;

    const terminal = wrapTerminalCallbacks(callbacks);
    const opts = sseDispatchOptions(this._sseChatId);

    try {
      if (shouldUseXhrForAgentSse()) {
        const result = await consumeAgentSseXhr(
          useGatewayStore.getState().apiUrl(path),
          {
            method: 'POST',
            headers: buildAgentSseMultipartHeaders(),
            body: formData,
            signal: abortController.signal,
          },
          terminal.wrapped,
          opts,
        );
        notifyUnauthorizedIfNeeded(result.status);
        if (!result.ok) {
          const errBody = parseApiErrorBody(result.responseText);
          throw new Error(formatApiHttpError(result.status, result.statusText, errBody));
        }
      } else {
        const res = await apiFetch(path, {
          method: 'POST',
          headers: { Accept: 'text/event-stream' },
          body: formData,
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(formatApiHttpError(res.status, res.statusText, errBody.error?.message));
        }

        if (isEventStreamResponse(res)) {
          await consumeAgentSseResponse(res, terminal.wrapped, opts);
        } else {
          const json = (await res.json()) as { ok?: boolean; payload?: { content?: string } };
          if (json.ok && json.payload?.content) {
            callbacks?.onToken(json.payload.content);
            callbacks?.onResult();
          }
        }
      }

      if (!terminal.sawTerminal && !abortController.signal.aborted) {
        terminal.onMissingTerminal();
      }
    } finally {
      this._clearPendingRun();
      if (this._abort === abortController) {
        this._abort = undefined;
      }
    }
  }

  abort(): void {
    this._notifyServerAbort();
    this._clearPendingRun();
    this._abort?.abort();
    this._abort = undefined;
  }

  private _notifyServerAbort(): void {
    if (!this._sseChatId) return;
    try {
      const raw = storage.getString(pendingRunStorageKey(this._sseChatId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { runId?: string };
      if (typeof parsed.runId !== 'string' || !parsed.runId) return;
      void apiFetch('/api/agent/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: parsed.runId }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private _clearPendingRun(): void {
    if (this._sseChatId) {
      try {
        storage.delete(pendingRunStorageKey(this._sseChatId));
      } catch {
        /* ignore */
      }
    }
  }

  async sendMessage(
    message: string,
    sessionKey: string,
    callbacks?: MessagingCallbacks,
    attachments?: WireAttachment[],
  ): Promise<void> {
    const capped = capAttachments(attachments);
    return this.send(
      '/api/agent',
      {
        message,
        sessionKey,
        ...(capped?.length ? { attachments: capped } : {}),
        clientCreatedAtMs: Date.now(),
      },
      callbacks,
    );
  }

  async sendVoiceMessage(
    payload: VoiceMessagePayload,
    sessionKey: string,
    callbacks?: MessagingCallbacks,
  ): Promise<void> {
    const mimeType = payload.mimeType || 'audio/mp4';
    const name = payload.name || (mimeType.includes('mpeg') ? 'voice.mp3' : 'voice.m4a');
    const formData = new FormData();
    formData.append('sessionKey', sessionKey);
    formData.append('channel', 'webchat');
    formData.append('durationMillis', String(payload.durationMillis));
    formData.append('mimeType', mimeType);
    formData.append('file', {
      uri: payload.uri,
      name,
      type: mimeType,
    } as unknown as Blob);

    return this.sendMultipart('/api/agent/voice', formData, sessionKey, callbacks);
  }

  async resume(runId: string, chatId: string, callbacks?: MessagingCallbacks): Promise<void> {
    this._abort = new AbortController();
    this._sseChatId = chatId;
    const terminal = wrapTerminalCallbacks(callbacks);
    const opts = sseDispatchOptions(chatId);
    const bodyJson = JSON.stringify({ runId, chatId });

    if (shouldUseXhrForAgentSse()) {
      const result = await consumeAgentSseXhr(
        useGatewayStore.getState().apiUrl('/api/agent/resume'),
        {
          method: 'POST',
          headers: buildAgentSseHeaders(),
          body: bodyJson,
          signal: this._abort.signal,
        },
        terminal.wrapped,
        opts,
      );
      notifyUnauthorizedIfNeeded(result.status);
      if (!result.ok) {
        this._clearPendingRun();
        this._abort = undefined;
        return;
      }
    } else {
      const res = await apiFetch('/api/agent/resume', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: bodyJson,
        signal: this._abort.signal,
      });

      if (!res.ok) {
        this._clearPendingRun();
        this._abort = undefined;
        return;
      }

      if (isEventStreamResponse(res)) {
        await consumeAgentSseResponse(res, terminal.wrapped, opts);
      }
    }

    if (!terminal.sawTerminal && !this._abort?.signal.aborted) {
      terminal.onMissingTerminal();
    }

    this._clearPendingRun();
    this._abort = undefined;
  }
}

function parseApiErrorBody(responseText?: string): string | undefined {
  if (!responseText?.trim()) return undefined;
  try {
    const body = JSON.parse(responseText) as { error?: { message?: string } };
    return body.error?.message;
  } catch {
    return undefined;
  }
}
