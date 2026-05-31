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
  formatApiHttpError,
  notifyUnauthorizedIfNeeded,
} from './client';
import { consumeE2eeRelayAgentSse, shouldUseE2eeStream } from './e2ee-stream';
import { readUriAsBase64 } from '../features/chat/attachment-file-io';
import { capAttachments } from '../features/chat/chat-limits';
import type { WireAttachment } from '../features/chat/composer.types';
import {
  clearPendingAgentRun,
  readPendingAgentRunId,
  setPendingAgentRun,
} from '../features/gateway/pending-agent-run';
import { isTransientNetworkError } from '../features/chat/network-errors';
import { useGatewayStore } from '../stores/gateway-store';
import { pendingRunStorageKey, storage } from '../storage/mmkv';

export type MessagingCallbacks = AgentSseCallbacks;

export type VoiceMessagePayload = {
  uri: string;
  durationMillis: number;
  mimeType?: string;
  name?: string;
};

export interface VoiceTranscribeResult {
  raw: string;
  refined?: string;
  language?: string;
}

/**
 * Transcribe audio via gateway STT + optional LLM refine.
 * Returns { raw, refined?, language? }.
 */
export async function transcribeVoice(
  uri: string,
  mimeType: string,
  options?: { language?: string },
): Promise<VoiceTranscribeResult> {
  const { content } = await readUriAsBase64(uri, 'voice.m4a');
  const res = await apiFetch('/api/voice/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio: content,
      mimeType,
      ...(options?.language ? { language: options.language } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(
      formatApiHttpError(res.status, res.statusText, body.error?.message),
    );
  }
  const json = (await res.json()) as { ok: boolean; payload?: VoiceTranscribeResult; error?: { message?: string } };
  if (!json.ok || !json.payload) {
    throw new Error(json.error?.message ?? 'Transcription failed');
  }
  return json.payload;
}

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

function sseDispatchOptions(sseChatId: string, sender: AgentMessageSender): AgentSseDispatchOptions {
  return {
    sseChatId,
    savePendingRunId: (chatId, runId) => {
      sender.trackPendingRunId(runId);
      setPendingAgentRun(chatId, runId);
    },
  };
}

/**
 * Streams agent output from `POST /api/agent` (and resume), matching the web gateway console.
 */
export class AgentMessageSender {
  private _abort?: AbortController;
  private _sseChatId = '';
  /** `runId` from the `status` event for this POST/resume; do not clear a newer pending run. */
  private _trackedRunId?: string;
  /** Local transport teardown for resume/recovery — do not abort the server run or clear pending runId. */
  private _localDetach = false;

  get isSending() {
    return !!this._abort;
  }

  isStreamingFor(chatId: string): boolean {
    return !!this._abort && this._sseChatId === chatId;
  }

  trackPendingRunId(runId: string): void {
    const id = runId.trim();
    if (id) this._trackedRunId = id;
  }

  /**
   * Drop the in-flight SSE transport without notifying the server or clearing the pending runId.
   * Used when the connection stalls and we need to reconnect via `/api/agent/resume`.
   */
  detachLocalStream(): void {
    if (!this._abort) return;
    this._localDetach = true;
    const abortController = this._abort;
    abortController.abort();
    if (this._abort === abortController) {
      this._abort = undefined;
    }
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
    const opts = sseDispatchOptions(this._sseChatId, this);

    try {
      if (await shouldUseE2eeStream()) {
        const result = await consumeE2eeRelayAgentSse(
          path,
          {
            method: 'POST',
            body: bodyJson,
            signal: abortController.signal,
          },
          terminal.wrapped,
          opts,
        );
        if (result.aborted) return;
        if (!result.ok) {
          throw new Error(formatApiHttpError(result.status, result.status === 404 ? 'Not Found' : 'Error'));
        }
      } else if (shouldUseXhrForAgentSse()) {
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
    } catch (e) {
      this._preservePendingRunForRecovery(
        e,
        abortController.signal.aborted,
        terminal.sawTerminal,
        this._localDetach,
      );
      throw e;
    } finally {
      const localDetach = this._localDetach;
      this._localDetach = false;
      if (terminal.sawTerminal || (abortController.signal.aborted && !localDetach)) {
        this._clearPendingRun();
      } else if (localDetach) {
        this._rePersistPendingRunAfterDetach();
      }
      if (this._abort === abortController) {
        this._abort = undefined;
      }
    }
  }

  abort(): void {
    this._notifyServerAbort();
    this._forceClearPendingRun();
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

  private _forceClearPendingRun(): void {
    const chatId = this._sseChatId;
    if (!chatId) return;
    try {
      storage.delete(pendingRunStorageKey(chatId));
      clearPendingAgentRun(chatId);
    } catch {
      /* ignore */
    }
    this._trackedRunId = undefined;
  }

  private _clearPendingRun(): void {
    const chatId = this._sseChatId;
    if (!chatId) return;
    try {
      const key = pendingRunStorageKey(chatId);
      const raw = storage.getString(key);
      if (raw) {
        const pr = JSON.parse(raw) as { runId?: string };
        const stored = typeof pr?.runId === 'string' ? pr.runId : '';
        if (this._trackedRunId && stored && stored !== this._trackedRunId) {
          return;
        }
      }
      storage.delete(key);
      clearPendingAgentRun(chatId);
    } catch {
      /* ignore */
    }
    this._trackedRunId = undefined;
  }

  async sendMessage(
    message: string,
    sessionKey: string,
    callbacks?: MessagingCallbacks,
    attachments?: WireAttachment[],
    options?: { modelRef?: string },
  ): Promise<void> {
    const capped = capAttachments(attachments);
    const modelRef = options?.modelRef?.trim();
    return this.send(
      '/api/agent',
      {
        message,
        sessionKey,
        ...(capped?.length ? { attachments: capped } : {}),
        ...(modelRef ? { modelRef } : {}),
        clientCreatedAtMs: Date.now(),
      },
      callbacks,
    );
  }

  async sendVoiceMessage(
    payload: VoiceMessagePayload,
    sessionKey: string,
    callbacks?: MessagingCallbacks,
    options?: { modelRef?: string },
  ): Promise<void> {
    const mimeType = payload.mimeType || 'audio/mp4';
    const name = payload.name || (mimeType.includes('mpeg') ? 'voice.mp3' : 'voice.m4a');
    const { content, size } = await readUriAsBase64(payload.uri, name);
    const secs = payload.durationMillis / 1000;
    const durationSeconds =
      Number.isFinite(secs) && secs >= 0.05 ? Math.round(secs * 1000) / 1000 : undefined;
    const wire: WireAttachment = {
      type: 'voice',
      mimeType,
      data: content,
      name,
      size,
      ...(durationSeconds != null ? { durationSeconds } : {}),
    };
    return this.sendMessage('', sessionKey, callbacks, [wire], options);
  }

  async resume(runId: string, chatId: string, callbacks?: MessagingCallbacks): Promise<void> {
    if (this.isStreamingFor(chatId)) {
      this.detachLocalStream();
    }
    this._trackedRunId = undefined;
    this._abort = new AbortController();
    const abortController = this._abort;
    this._sseChatId = chatId;
    this.trackPendingRunId(runId);
    const terminal = wrapTerminalCallbacks(callbacks);
    const opts = sseDispatchOptions(chatId, this);
    const bodyJson = JSON.stringify({ runId, chatId });

    try {
      if (await shouldUseE2eeStream()) {
        const result = await consumeE2eeRelayAgentSse(
          '/api/agent/resume',
          {
            method: 'POST',
            body: bodyJson,
            signal: abortController.signal,
          },
          terminal.wrapped,
          opts,
        );
        if (result.aborted) return;
        if (!result.ok) {
          throw new Error(formatApiHttpError(result.status, result.status === 404 ? 'Not Found' : 'Error'));
        }
      } else if (shouldUseXhrForAgentSse()) {
        const result = await consumeAgentSseXhr(
          useGatewayStore.getState().apiUrl('/api/agent/resume'),
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
        const res = await apiFetch('/api/agent/resume', {
          method: 'POST',
          headers: { Accept: 'text/event-stream' },
          body: bodyJson,
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(formatApiHttpError(res.status, res.statusText, errBody.error?.message));
        }

        if (isEventStreamResponse(res)) {
          await consumeAgentSseResponse(res, terminal.wrapped, opts);
        }
      }

      if (!terminal.sawTerminal && !abortController.signal.aborted) {
        terminal.onMissingTerminal();
      }
    } catch (e) {
      this._preservePendingRunForRecovery(
        e,
        abortController.signal.aborted,
        terminal.sawTerminal,
        this._localDetach,
      );
      throw e;
    } finally {
      const localDetach = this._localDetach;
      this._localDetach = false;
      if (terminal.sawTerminal || (abortController.signal.aborted && !localDetach)) {
        this._clearPendingRun();
      } else if (localDetach) {
        this._rePersistPendingRunAfterDetach();
      }
      if (this._abort === abortController) {
        this._abort = undefined;
      }
    }
  }

  private _rePersistPendingRunAfterDetach(): void {
    const chatId = this._sseChatId;
    const runId =
      this._trackedRunId?.trim() ||
      (chatId ? readPendingAgentRunId(chatId) : null) ||
      undefined;
    if (chatId && runId) {
      setPendingAgentRun(chatId, runId);
    }
  }

  private _preservePendingRunForRecovery(
    error: unknown,
    aborted: boolean,
    sawTerminal: boolean,
    localDetach = false,
  ): void {
    if ((aborted && !localDetach) || sawTerminal) return;
    const message = error instanceof Error ? error.message : String(error);
    if (!isTransientNetworkError(message)) return;
    const chatId = this._sseChatId;
    const runId =
      this._trackedRunId?.trim() ||
      (chatId ? readPendingAgentRunId(chatId) : null) ||
      undefined;
    if (chatId && runId) {
      setPendingAgentRun(chatId, runId);
    }
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
