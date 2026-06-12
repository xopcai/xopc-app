import { describe, expect, it } from 'vitest';

import {
  buildWebchatSessionKey,
  extractChatIdFromWebchatSessionKey,
  generateNewChatId,
  normalizeAgentId,
} from '../session-key';

describe('session-key', () => {
  it('buildWebchatSessionKey matches gateway per-account-channel-peer format', () => {
    expect(buildWebchatSessionKey('Main', 'chat_abc123')).toBe(
      'agent:main:webchat:default:direct:chat_abc123',
    );
  });

  it('generateNewChatId uses chat_ prefix', () => {
    expect(generateNewChatId()).toMatch(/^chat_\d+_[a-z0-9]+$/);
  });

  it('normalizeAgentId lowercases and sanitizes', () => {
    expect(normalizeAgentId('MainAgent')).toBe('mainagent');
    expect(normalizeAgentId('')).toBe('main');
  });

  it('extractChatIdFromWebchatSessionKey round-trips', () => {
    const chatId = 'chat_123_abc';
    const key = buildWebchatSessionKey('main', chatId);
    expect(extractChatIdFromWebchatSessionKey(key)).toBe(chatId);
  });
});
