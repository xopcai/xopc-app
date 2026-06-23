import { describe, expect, it } from 'vitest';

import {
  filterOptimisticMessagesCoveredBySession,
  streamingMessageCoveredBySession,
} from '../display-message-reconcile';
import type { Message } from '../messages.types';

describe('display message reconciliation', () => {
  it('filters an optimistic user message once the persisted session row is visible', () => {
    const sessionMessages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: '[2026-06-23 12:00 UTC] hello' }],
      },
    ];
    const optimisticMessages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];

    expect(filterOptimisticMessagesCoveredBySession(sessionMessages, optimisticMessages)).toEqual([]);
  });

  it('keeps a distinct optimistic user message', () => {
    const sessionMessages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];
    const optimisticMessages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello again' }],
      },
    ];

    expect(filterOptimisticMessagesCoveredBySession(sessionMessages, optimisticMessages)).toEqual(
      optimisticMessages,
    );
  });

  it('only consumes one optimistic user message per matching persisted row', () => {
    const sessionMessages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];
    const optimisticMessages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];

    expect(filterOptimisticMessagesCoveredBySession(sessionMessages, optimisticMessages)).toEqual([
      optimisticMessages[1],
    ]);
  });

  it('treats a streaming assistant message as covered by a persisted assistant row', () => {
    const sessionMessages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello world' }],
      },
    ];
    const streamingMsg: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'hello world' }],
    };

    expect(streamingMessageCoveredBySession(sessionMessages, streamingMsg)).toBe(true);
  });

  it('treats streaming assistant TTS audio as covered when the persisted row has the same audio', () => {
    const sessionMessages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hello' },
          {
            type: 'audio',
            uri: 'media://tts/reply.mp3',
            mimeType: 'audio/mpeg',
            name: 'reply.mp3',
          },
        ],
      },
    ];
    const streamingMsg: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        {
          type: 'audio',
          uri: 'media://tts/reply.mp3',
          mimeType: 'audio/mpeg',
          name: 'reply.mp3',
        },
      ],
    };

    expect(streamingMessageCoveredBySession(sessionMessages, streamingMsg)).toBe(true);
  });

  it('keeps a streaming assistant message when the persisted row does not contain its latest text', () => {
    const sessionMessages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];
    const streamingMsg: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'hello world' }],
    };

    expect(streamingMessageCoveredBySession(sessionMessages, streamingMsg)).toBe(false);
  });
});
