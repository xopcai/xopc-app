import { describe, expect, it, vi } from 'vitest';

import {
  AgentSseLineParser,
  consumeAgentSseFromText,
  consumeAgentSseResponse,
  consumeAgentSseStream,
  dispatchAgentSseEvent,
} from '../src/agent-sse.js';

function encodeSse(chunks: Array<{ event: string; data: object }>): Uint8Array {
  const lines: string[] = [];
  for (const c of chunks) {
    lines.push(`event: ${c.event}`);
    lines.push(`data: ${JSON.stringify(c.data)}`);
    lines.push('');
  }
  return new TextEncoder().encode(lines.join('\n'));
}

describe('dispatchAgentSseEvent', () => {
  it('emits token from token event', () => {
    const onToken = vi.fn();
    dispatchAgentSseEvent('token', JSON.stringify({ content: 'hi' }), { onToken } as never);
    expect(onToken).toHaveBeenCalledWith('hi');
  });

  it('calls onResult for malformed JSON on result event', () => {
    const onResult = vi.fn();
    dispatchAgentSseEvent('result', 'not-json', {
      onResult,
    } as never);
    expect(onResult).toHaveBeenCalled();
  });

  it('persists runId on status when savePendingRunId provided', () => {
    const savePendingRunId = vi.fn();
    dispatchAgentSseEvent(
      'status',
      JSON.stringify({ runId: 'run-1', status: 'x' }),
      { onStreamStart: vi.fn() } as never,
      { sseChatId: 'chat_a', savePendingRunId },
    );
    expect(savePendingRunId).toHaveBeenCalledWith('chat_a', 'run-1');
  });
});

describe('AgentSseLineParser', () => {
  it('dispatches token events as chunks arrive', () => {
    const onToken = vi.fn();
    const parser = new AgentSseLineParser({ onToken } as never);
    parser.feed('event: token\ndata: {"content":');
    expect(onToken).not.toHaveBeenCalled();
    parser.feed('"hi"}\n\n');
    expect(onToken).toHaveBeenCalledWith('hi');
  });
});

describe('consumeAgentSseFromText', () => {
  it('parses SSE from a buffered string', () => {
    const onToken = vi.fn();
    const onResult = vi.fn();
    const text = new TextDecoder().decode(
      encodeSse([
        { event: 'token', data: { content: 'x' } },
        { event: 'result', data: { ok: true } },
      ]),
    );
    consumeAgentSseFromText(text, {
      onStreamStart: () => {},
      onToken,
      onThinking: () => {},
      onThinkingEnd: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onProgress: () => {},
      onResult,
      onError: () => {},
    });
    expect(onToken).toHaveBeenCalledWith('x');
    expect(onResult).toHaveBeenCalled();
  });
});

describe('consumeAgentSseResponse', () => {
  it('falls back to text() when response.body is null', async () => {
    const onToken = vi.fn();
    const payload = new TextDecoder().decode(
      encodeSse([{ event: 'token', data: { content: 'from-text' } }, { event: 'result', data: {} }]),
    );
    const res = new Response(payload, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
    Object.defineProperty(res, 'body', { value: null });

    await consumeAgentSseResponse(res, {
      onStreamStart: () => {},
      onToken,
      onThinking: () => {},
      onThinkingEnd: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onProgress: () => {},
      onResult: () => {},
      onError: () => {},
    });

    expect(onToken).toHaveBeenCalledWith('from-text');
  });
});

describe('consumeAgentSseStream', () => {
  it('parses multiple SSE events', async () => {
    const onToken = vi.fn();
    const onResult = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encodeSse([
            { event: 'token', data: { content: 'a' } },
            { event: 'token', data: { content: 'b' } },
            { event: 'result', data: { ok: true, payload: { status: 'done', summary: '' } } },
          ]),
        );
        controller.close();
      },
    });

    await consumeAgentSseStream(body, {
      onStreamStart: () => {},
      onToken,
      onThinking: () => {},
      onThinkingEnd: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onProgress: () => {},
      onResult,
      onError: () => {},
    });

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenNthCalledWith(1, 'a');
    expect(onToken).toHaveBeenNthCalledWith(2, 'b');
    expect(onResult).toHaveBeenCalled();
  });
});
