import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSession } from '../sessions';
import { apiFetch } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  formatApiHttpError: vi.fn((status: number, statusText: string, message?: string) =>
    message ? `${status} ${statusText}: ${message}` : `${status} ${statusText}`,
  ),
}));

vi.mock('../../stores/gateway-store', () => ({
  useGatewayStore: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe('createSession', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { key: 'agent:webchat:default:direct:chat_test' } }),
    } as Response);
  });

  it('sends a chat_id when forceNew is enabled', async () => {
    await createSession('MainAgent', { forceNew: true });

    const [, init] = mockedApiFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      agentId?: string;
      channel?: string;
      chat_id?: string;
    };

    expect(body.channel).toBe('webchat');
    expect(body.agentId).toBe('mainagent');
    expect(body.chat_id).toMatch(/^chat_\d+_[a-z0-9]+$/);
  });

  it('does not send a chat_id by default so empty sessions can be reused', async () => {
    await createSession('MainAgent');

    const [, init] = mockedApiFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as { chat_id?: string };

    expect(body.chat_id).toBeUndefined();
  });
});