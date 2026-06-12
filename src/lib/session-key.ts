/**
 * Client-side webchat session key builder — must match gateway
 * `buildSessionKey({ source: 'webchat', accountId: 'default', peerKind: 'direct', dmScope: 'per-account-channel-peer' })`.
 *
 * Format: `agent:{agentId}:webchat:default:direct:{chatId}`
 */

const VALID_AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'main';
  const lowered = trimmed.toLowerCase();
  if (VALID_AGENT_ID_RE.test(trimmed)) return lowered;
  return (
    lowered
      .replace(INVALID_CHARS_RE, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'main'
  );
}

/** Matches server `chat_${Date.now()}` / mobile `forceNew` suffix pattern. */
export function generateNewChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildWebchatSessionKey(agentId: string, chatId: string): string {
  const id = normalizeAgentId(agentId);
  const peerId = chatId.trim().toLowerCase();
  return `agent:${id}:webchat:default:direct:${peerId}`;
}

export function extractChatIdFromWebchatSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.trim().toLowerCase().split(':').filter(Boolean);
  if (parts.length < 6 || parts[0] !== 'agent') return null;
  if (parts[2] !== 'webchat' || parts[3] !== 'default' || parts[4] !== 'direct') return null;
  return parts.slice(5).join(':') || null;
}
