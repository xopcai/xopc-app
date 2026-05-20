/**
 * Chat screen — the main page inside the drawer.
 *
 * Header layout (matching web UI design):
 *   Left:   ☰ hamburger (open drawer) | + new chat
 *   Center: model name picker (pill shape)
 *   Right:  session management icon
 */
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerActions } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Banner, IconButton, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentMessageSender, submitClarifyResponse, type MessagingCallbacks } from '../../src/api/agent-client';
import { ChatComposer } from '../../src/features/chat/ChatComposer';
import { canSendComposerDraft, buildOptimisticUserMessage } from '../../src/features/chat/composer-send-helpers';
import type { WireAttachment } from '../../src/features/chat/composer.types';
import { ClarifyPrompt, type ClarifyPromptState } from '../../src/features/chat/ClarifyPrompt';
import { AgentPickerSheet } from '../../src/features/chat/AgentPickerSheet';
import { ChatEmptyShortcutsBar } from '../../src/features/chat/ChatEmptyShortcutsBar';
import { EMPTY_CHAT_GOAL_PREFILL } from '../../src/features/chat/chat-empty-shortcuts';
import { GoalMissionCard } from '../../src/features/chat/GoalMissionCard';
import { MessageList } from '../../src/features/chat/MessageList';
import { sendOrQueueMessage } from '../../src/features/chat/send-or-queue';
import {
  FOLLOW_UP_AUTO_SEND_IDLE_MS,
  MAX_PENDING_FOLLOW_UPS,
} from '../../src/features/chat/pending-follow-up.types';
import { useChatFollowUp } from '../../src/features/chat/use-chat-follow-up';
import {
  useAgentStreamResume,
  type AgentStreamResumeOptions,
} from '../../src/features/chat/use-agent-stream-resume';
import { GatewayOfflineBanner } from '../../src/features/gateway/GatewayOfflineBanner';
import { subscribeGatewayEvent } from '../../src/features/gateway/gateway-event-bus';
import { useGatewayHealth } from '../../src/features/gateway/use-gateway-health';
import {
  readPendingAgentRunId,
  subscribePendingAgentRunChanged,
} from '../../src/features/gateway/pending-agent-run';
import {
  applyStripToUserContent,
  extractAttachmentsFromUserContent,
  mergeUserAttachments,
} from '../../src/features/chat/inbound-message-text';
import type { Message, MessageAttachment, MessageContent, ProgressState } from '../../src/features/chat/messages.types';
import { useMessages, t } from '../../src/i18n/messages';
import { RenameDialog } from '../../src/features/sessions/RenameDialog';
import {
  appendTextDelta,
  appendThinkingDelta,
  appendToolStart,
  cloneMessageForRender,
  completeTool,
  ensureAssistantMessage,
  finalizeRunningTools,
  finalizeStreamingThinking,
  hasRenderableAssistantContent,
  startThinkingSegment,
} from '../../src/features/chat/streaming';
import { fetchChatAgents, resolveEffectiveDefaultAgentId } from '../../src/query/agents';
import { queryKeys } from '../../src/query/keys';
import {
  createSession,
  fetchSession,
  renameSession,
  useGatewayConfigured,
} from '../../src/query/sessions';
import { useKeyboardVisible } from '../../src/hooks/use-keyboard-visible';
import { usePreferencesStore } from '../../src/stores/preferences-store';

const STREAMING_RENDER_THROTTLE_MS = 50;

// ── Session wire → UI message helpers (ported from web/src/features/chat/agent-messages.ts) ──

type WireContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  source?: { data?: string; media_type?: string };
  data?: string;
  mimeType?: string;
  workspaceRelativePath?: string;
  uri?: string;
  durationSeconds?: number;
  id?: string;
  name?: string;
  input?: unknown;
  args?: unknown;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
  result?: string;
  status?: string;
};

type WireMessage = {
  role?: string;
  content?: unknown;
  timestamp?: string | number;
  attachments?: unknown;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  toolCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }>;
  tool_call_id?: string;
  toolCallId?: string;
  isError?: boolean;
};

function wireImageBlockToContent(block: WireContentBlock): MessageContent | null {
  const fromSource = block.source?.data;
  if (typeof fromSource === 'string' && fromSource.length > 0) {
    return { type: 'image', source: { data: fromSource, media_type: block.source?.media_type } };
  }

  const raw = block.data;
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return { type: 'image', source: { data: trimmed } };
  }

  const mime =
    typeof block.mimeType === 'string' && block.mimeType.includes('/')
      ? block.mimeType
      : 'image/png';
  return { type: 'image', source: { data: `data:${mime};base64,${trimmed.replace(/\s/g, '')}` } };
}

/** Parse a single content block from wire format. */
function parseContentBlock(b: Record<string, unknown>): MessageContent | null {
  const block = b as WireContentBlock;
  const t = block.type;
  if (t === 'text') return { type: 'text', text: String(block.text ?? '') };
  if (t === 'thinking') return { type: 'thinking', text: String(block.text ?? block.thinking ?? ''), streaming: false };
  if (t === 'audio' || t === 'tts_audio' || block.mimeType?.startsWith('audio/')) {
    return {
      type: 'audio',
      workspaceRelativePath: block.workspaceRelativePath,
      uri: block.uri ?? (typeof block.data === 'string' && block.data.startsWith('data:') ? block.data : undefined),
      mimeType: block.mimeType,
      name: block.name,
      durationSeconds: block.durationSeconds,
    };
  }
  if (t === 'image' || (typeof block.data === 'string' && typeof block.mimeType === 'string')) {
    return wireImageBlockToContent(block);
  }
  if (t === 'tool_use' || t === 'tool_call' || t === 'toolCall') {
    return {
      type: 'tool_use',
      id: String(block.id ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
      name: String(block.name ?? block.function?.name ?? 'tool'),
      input: block.input ?? block.args ?? block.arguments ?? block.function?.arguments,
      status: (block.status === 'running' || block.status === 'error') ? block.status : 'done' as const,
      result: block.result,
    };
  }
  return { type: 'text', text: String(block.text ?? '') };
}

/** Normalize raw content to MessageContent[]. */
function normalizeContentBlocks(raw: unknown): MessageContent[] {
  if (raw == null) return [];
  if (typeof raw === 'string') return raw.trim() ? [{ type: 'text', text: raw }] : [];
  if (!Array.isArray(raw)) return [{ type: 'text', text: String(raw) }];
  return raw
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map(parseContentBlock)
    .filter((block): block is MessageContent => block != null);
}

/** Build assistant content, including top-level tool_calls / toolCalls fields. */
function buildAssistantContent(m: WireMessage): MessageContent[] {
  const blocks = normalizeContentBlocks(m.content);

  // OpenAI format: top-level tool_calls array
  if (Array.isArray(m.tool_calls)) {
    for (const call of m.tool_calls) {
      if (!call?.id || blocks.some((b) => b.type === 'tool_use' && b.id === call.id)) continue;
      let input: unknown = call.function?.arguments;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch { /* keep string */ } }
      blocks.push({ type: 'tool_use', id: call.id, name: call.function?.name || 'tool', input, status: 'running' });
    }
  }

  // Pi format: top-level toolCalls array
  if (Array.isArray(m.toolCalls)) {
    for (const call of m.toolCalls) {
      const id = call.id ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (blocks.some((b) => b.type === 'tool_use' && b.id === id)) continue;
      blocks.push({ type: 'tool_use', id, name: call.name || 'tool', input: call.args, status: 'running' });
    }
  }

  return blocks;
}

/** Extract plain-text from toolResult content. */
function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object' && c.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('\n');
  }
  return String(content ?? '');
}

/** Apply a toolResult message's result to the last assistant's matching tool_use block. */
function applyToolResultToLastAssistant(out: Message[], m: WireMessage): void {
  let lastAssistant: Message | null = null;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'assistant') { lastAssistant = out[i]; break; }
  }
  if (!lastAssistant) return;

  const id = String(m.tool_call_id ?? m.toolCallId ?? '');
  const text = extractToolResultText(m.content);
  const isError = Boolean(m.isError);

  // Match by tool_call_id
  if (id) {
    const block = lastAssistant.content.find(
      (b): b is import('../../src/features/chat/messages.types').ToolUseContent =>
        b.type === 'tool_use' && b.id === id,
    );
    if (block) {
      block.status = isError ? 'error' : 'done';
      block.result = text;
      return;
    }
  }

  // Fallback: if exactly one tool is still running, apply to it
  const running = lastAssistant.content.filter(
    (b): b is import('../../src/features/chat/messages.types').ToolUseContent =>
      b.type === 'tool_use' && b.status === 'running',
  );
  if (running.length === 1) {
    running[0].status = isError ? 'error' : 'done';
    running[0].result = text;
  }
}

/** Merge two assistant content arrays: dedupe tool_use by id, dedupe adjacent identical thinking. */
function mergeAssistantContentFragments(left: MessageContent[], right: MessageContent[]): MessageContent[] {
  const out: MessageContent[] = left.map((b) => ({ ...b }));
  const toolIndexById = new Map<string, number>();
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.type === 'tool_use') toolIndexById.set(b.id, i);
  }

  for (const b of right) {
    if (b.type === 'tool_use' && toolIndexById.has(b.id)) {
      const idx = toolIndexById.get(b.id)!;
      out[idx] = { ...b }; // keep the later (more complete) version
      continue;
    }
    if (b.type === 'thinking' && out.length > 0) {
      const last = out[out.length - 1];
      if (last.type === 'thinking' && (last.text || '').trim() === (b.text || '').trim()) continue;
    }
    if (b.type === 'tool_use') toolIndexById.set(b.id, out.length);
    out.push({ ...b });
  }
  return out;
}

/** Merge consecutive assistant messages into a single bubble (session stores fragments). */
function mergeConsecutiveAssistantMessages(messages: Message[]): Message[] {
  if (messages.length < 2) return messages;
  const out: Message[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') { out.push(m); continue; }
    const prev = out[out.length - 1];
    if (prev?.role === 'assistant') {
      prev.content = mergeAssistantContentFragments(prev.content, m.content);
      if (m.timestamp != null) prev.timestamp = m.timestamp;
      if (m.usage) prev.usage = m.usage;
    } else {
      out.push({ ...m, content: [...m.content] });
    }
  }
  return out;
}

function parseTimestamp(raw: string | number | undefined): number | undefined {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

function normalizeAttachments(raw: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map((item): MessageAttachment => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      type: typeof item.type === 'string' ? item.type : undefined,
      mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
      size: typeof item.size === 'number' ? item.size : undefined,
      content: typeof item.content === 'string' ? item.content : undefined,
      data: typeof item.data === 'string' ? item.data : undefined,
      preview: typeof item.preview === 'string' ? item.preview : undefined,
      extractedText: typeof item.extractedText === 'string' ? item.extractedText : undefined,
      workspaceRelativePath: typeof item.workspaceRelativePath === 'string' ? item.workspaceRelativePath : undefined,
      durationSeconds: typeof item.durationSeconds === 'number' ? item.durationSeconds : undefined,
    }));
  return out.length ? out : undefined;
}

function isAudioAttachment(att: MessageAttachment): boolean {
  return att.type === 'voice' || att.type === 'audio' || att.mimeType?.startsWith('audio/') === true;
}

function audioAttachmentToContent(att: MessageAttachment): MessageContent | null {
  if (!isAudioAttachment(att)) return null;
  const payload = att.preview || att.content || att.data;
  const mimeType = att.mimeType || 'audio/mpeg';
  return {
    type: 'audio',
    workspaceRelativePath: att.workspaceRelativePath,
    uri: payload ? (payload.startsWith('data:') ? payload : `data:${mimeType};base64,${payload.replace(/\s/g, '')}`) : undefined,
    mimeType,
    name: att.name,
    durationSeconds: att.durationSeconds,
  };
}

function appendAudioAttachments(content: MessageContent[], attachments: MessageAttachment[] | undefined): MessageContent[] {
  if (!attachments?.length) return content;
  const existingKeys = new Set(
    content
      .filter((b) => b.type === 'audio')
      .map((b) => b.workspaceRelativePath || b.uri || b.name || '')
      .filter(Boolean),
  );
  const audioBlocks = attachments
    .map(audioAttachmentToContent)
    .filter((b): b is MessageContent => b != null)
    .filter((b) => {
      const key = b.type === 'audio' ? b.workspaceRelativePath || b.uri || b.name || '' : '';
      if (!key || existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
  return audioBlocks.length ? [...content, ...audioBlocks] : content;
}

/**
 * Convert raw session messages (unknown content shape) to typed Message[].
 *
 * Handles toolResult/tool role messages, merges consecutive assistant fragments,
 * and supports OpenAI tool_calls / pi toolCalls formats — matching the web gateway console.
 */
function parseSessionMessages(raw: Array<Record<string, unknown>>): Message[] {
  const out: Message[] = [];

  for (const item of raw) {
    const m = item as unknown as WireMessage;
    const role = String(m.role ?? '');

    // Skip system messages
    if (role === 'system') continue;

    // Tool results → apply to the last assistant's tool_use block
    if (role === 'toolResult' || role === 'tool') {
      applyToolResultToLastAssistant(out, m);
      continue;
    }

    if (role === 'user' || role === 'user-with-attachments') {
      const roleTyped = role as Message['role'];
      const fromContent = extractAttachmentsFromUserContent(m.content);
      const attachments = mergeUserAttachments(normalizeAttachments(m.attachments), fromContent);
      out.push({
        role: roleTyped,
        content: applyStripToUserContent(roleTyped, normalizeContentBlocks(m.content)),
        attachments,
        timestamp: parseTimestamp(m.timestamp),
      });
      continue;
    }

    if (role === 'assistant') {
      const attachments = normalizeAttachments(m.attachments);
      out.push({
        role: 'assistant',
        content: appendAudioAttachments(buildAssistantContent(m), attachments),
        attachments,
        timestamp: parseTimestamp(m.timestamp),
      });
      continue;
    }

    // Unknown roles → skip (don't render as assistant)
  }

  return mergeConsecutiveAssistantMessages(out);
}

export default function ChatScreen() {
  const { k: rawKey } = useLocalSearchParams<{ k?: string }>();
  const sessionKey = typeof rawKey === 'string' ? rawKey : Array.isArray(rawKey) ? rawKey[0] : '';
  const navigation = useNavigation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const configured = useGatewayConfigured();
  const { gatewayOnline } = useGatewayHealth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const m = useMessages();

  // ── Agent / model info ───────────────────────────────────
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: configured,
  });

  const localDefaultAgentId = usePreferencesStore((s) => s.defaultAgentId);

  const [creatingInitialSession, setCreatingInitialSession] = useState(false);
  const autoSessionStartedRef = useRef(false);

  const modelName = useMemo(() => {
    const agents = agentsQuery.data?.items ?? [];
    const defaultId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
    // Extract agentId from session key (format: {agentId}:{source}:{accountId}:{peerKind}:{peerId})
    const sessionAgentId = sessionKey ? sessionKey.split(':')[0]?.trim().toLowerCase() : null;
    const targetId = sessionAgentId || defaultId;
    const agent = agents.find((a) => a.id === targetId);
    return agent?.name ?? agent?.id ?? targetId;
  }, [agentsQuery.data, localDefaultAgentId, sessionKey]);

  // ── Session data ─────────────────────────────────────────
  const sessionQuery = useQuery({
    queryKey: queryKeys.session(sessionKey),
    queryFn: () => fetchSession(sessionKey),
    enabled: Boolean(sessionKey),
  });

  const [streamingMsg, setStreamingMsg] = useState<Message | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clarifyPrompt, setClarifyPrompt] = useState<ClarifyPromptState | null>(null);
  const [clarifySubmitting, setClarifySubmitting] = useState(false);
  const [clarifySubmitError, setClarifySubmitError] = useState<string | null>(null);
  const senderRef = useRef(new AgentMessageSender());
  const streamingRef = useRef(false);
  const sendingRef = useRef(false);
  const runBusyRef = useRef(false);
  const streamActiveRef = useRef(false);
  const clarifyActiveRef = useRef(false);
  const streamingMsgRef = useRef<Message | null>(null);
  const streamingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionKeyRef = useRef(sessionKey);
  const autoResumeFailedRef = useRef(false);
  const displayMessagesRef = useRef<Message[]>([]);
  const sendRef = useRef<(text: string, attachments?: WireAttachment[]) => Promise<boolean>>(
    async () => false,
  );
  const followUpFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStreamingFlushTimer = useCallback(() => {
    if (!streamingFlushTimerRef.current) return;
    clearTimeout(streamingFlushTimerRef.current);
    streamingFlushTimerRef.current = null;
  }, []);

  const flushStreamingMessage = useCallback(() => {
    clearStreamingFlushTimer();
    const message = streamingMsgRef.current;
    setStreamingMsg(message ? cloneMessageForRender(message) : null);
  }, [clearStreamingFlushTimer]);

  const updateStreamingMessage = useCallback((update: (message: Message) => void, flushImmediately = false) => {
    const message = ensureAssistantMessage(streamingMsgRef.current, Date.now());
    update(message);
    streamingMsgRef.current = message;

    if (flushImmediately) {
      flushStreamingMessage();
      return;
    }

    if (streamingFlushTimerRef.current) return;
    streamingFlushTimerRef.current = setTimeout(
      flushStreamingMessage,
      STREAMING_RENDER_THROTTLE_MS,
    );
  }, [flushStreamingMessage]);

  const clearStreamingMessage = useCallback(() => {
    clearStreamingFlushTimer();
    streamingMsgRef.current = null;
    setStreamingMsg(null);
  }, [clearStreamingFlushTimer]);

  /** Optimistic user messages appended before the server responds. */
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [awaitingSessionRefresh, setAwaitingSessionRefresh] = useState(false);
  const [sessionRefreshStartedAt, setSessionRefreshStartedAt] = useState(0);
  const sessionDataUpdatedAtRef = useRef(0);

  useEffect(() => {
    sessionDataUpdatedAtRef.current = sessionQuery.dataUpdatedAt;
  }, [sessionQuery.dataUpdatedAt]);

  useEffect(() => {
    activeSessionKeyRef.current = sessionKey;
    autoResumeFailedRef.current = false;
  }, [sessionKey]);

  const invalidateSessionByKey = useCallback((targetSessionKey: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.session(targetSessionKey) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    void queryClient.invalidateQueries({ queryKey: queryKeys.webchatGoal(targetSessionKey) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.webchatGoalRuns(targetSessionKey, 1) });
  }, [queryClient]);

  const invalidateSession = useCallback(() => {
    invalidateSessionByKey(sessionKey);
  }, [invalidateSessionByKey, sessionKey]);

  const sessionName = sessionQuery.data?.name?.trim() || '';
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [composerSuggestion, setComposerSuggestion] = useState<string | undefined>(undefined);

  // ── Header: hide default, use custom ─────────────────────
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleRename = useCallback(
    async (name: string) => {
      setRenameLoading(true);
      try {
        await renameSession(sessionKey, name);
        void queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionKey) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        setRenameVisible(false);
      } catch {
        setSnackMsg(m.chat.failedToRename);
      } finally {
        setRenameLoading(false);
      }
    },
    [sessionKey, queryClient],
  );

  /** Parsed messages from the loaded session. */
  const sessionMessages = useMemo<Message[]>(() => {
    const raw = sessionQuery.data?.messages;
    if (!raw || !Array.isArray(raw)) return [];
    return parseSessionMessages(raw);
  }, [sessionQuery.data?.messages]);

  const sessionRefreshComplete = awaitingSessionRefresh
    && sessionQuery.dataUpdatedAt > sessionRefreshStartedAt;

  /** Display messages: session history + optimistic user msgs + streaming assistant bubble. */
  const displayMessages = useMemo<Message[]>(() => {
    if (sessionRefreshComplete) return sessionMessages;

    const base = optimisticMessages.length > 0
      ? [...sessionMessages, ...optimisticMessages]
      : sessionMessages;
    if (!streamingMsg) return base;
    return [...base, streamingMsg];
  }, [sessionRefreshComplete, sessionMessages, optimisticMessages, streamingMsg]);

  useEffect(() => {
    displayMessagesRef.current = displayMessages;
  }, [displayMessages]);

  useEffect(() => {
    clarifyActiveRef.current = Boolean(clarifyPrompt);
  }, [clarifyPrompt]);

  useEffect(() => {
    streamActiveRef.current = streaming || sendingRef.current;
    runBusyRef.current = streaming || awaitingSessionRefresh || sendingRef.current;
  }, [streaming, awaitingSessionRefresh]);

  const followUp = useChatFollowUp({
    sessionKey,
    sessionKeyRef: activeSessionKeyRef,
    runBusyRef,
    streamActiveRef,
    clarifyActiveRef,
    sendRef,
    onQueueFull: () => {
      setSnackMsg(t(m.chat.followUpQueueMaxReached, { max: MAX_PENDING_FOLLOW_UPS }));
    },
  });

  /** Finalize a streaming turn and keep local messages visible until session refetch completes. */
  const finalizeMessage = useCallback((targetSessionKey = sessionKey) => {
    if (activeSessionKeyRef.current !== targetSessionKey) {
      invalidateSessionByKey(targetSessionKey);
      return;
    }

    setStreaming(false);
    streamingRef.current = false;
    setProgress(null);
    setClarifyPrompt(null);
    setClarifySubmitError(null);
    setClarifySubmitting(false);
    setAwaitingSessionRefresh(true);
    setSessionRefreshStartedAt(sessionDataUpdatedAtRef.current);
    invalidateSessionByKey(targetSessionKey);
  }, [invalidateSessionByKey, sessionKey]);

  useEffect(() => {
    if (!sessionRefreshComplete) return;

    clearStreamingMessage();
    setOptimisticMessages([]);
    setAwaitingSessionRefresh(false);
    setSessionRefreshStartedAt(0);
  }, [sessionRefreshComplete, clearStreamingMessage]);

  useEffect(() => {
    clearStreamingMessage();
    setStreaming(false);
    streamingRef.current = false;
    setProgress(null);
    setClarifyPrompt(null);
    setClarifySubmitError(null);
    setClarifySubmitting(false);
    setOptimisticMessages([]);
    setAwaitingSessionRefresh(false);
    setSessionRefreshStartedAt(0);
  }, [sessionKey, clearStreamingMessage]);

  function buildCallbacks(callbackSessionKey: string): MessagingCallbacks {
    const isCurrentSession = () => activeSessionKeyRef.current === callbackSessionKey;

    return {
      onStreamStart: () => {
        if (!isCurrentSession()) return;
        setStreaming(true);
        streamingRef.current = true;
        setError(null);
        updateStreamingMessage(() => {}, true);
      },
      onToken: (delta) => {
        if (!isCurrentSession()) return;
        updateStreamingMessage((message) => {
          appendTextDelta(message.content, delta);
        });
        if (!streamingRef.current) {
          setStreaming(true);
          streamingRef.current = true;
        }
      },
      onThinking: (text, isDelta) => {
        if (!isCurrentSession()) return;
        updateStreamingMessage((message) => {
          if (!isDelta && text === '') startThinkingSegment(message.content);
          else appendThinkingDelta(message.content, text, isDelta);
        });
      },
      onThinkingEnd: () => {
        if (!isCurrentSession() || !streamingMsgRef.current) return;
        finalizeStreamingThinking(streamingMsgRef.current.content);
        flushStreamingMessage();
      },
      onToolStart: (toolName, args) => {
        if (!isCurrentSession()) return;
        updateStreamingMessage((message) => {
          appendToolStart(message.content, toolName, args);
        }, true);
        if (!streamingRef.current) {
          setStreaming(true);
          streamingRef.current = true;
        }
      },
      onToolEnd: (toolName, isErr, result) => {
        if (!isCurrentSession()) return;
        updateStreamingMessage((message) => {
          completeTool(message.content, toolName, isErr, result);
        }, true);
      },
      onProgress: (p) => {
        if (!isCurrentSession()) return;
        setProgress(p);
      },
      onTtsAudio: (payload) => {
        if (!isCurrentSession()) return;
        updateStreamingMessage((message) => {
          message.content.push({
            type: 'audio',
            workspaceRelativePath: payload.workspaceRelativePath,
            mimeType: payload.mimeType,
            name: payload.name,
          });
        }, true);
        if (!streamingRef.current) {
          setStreaming(true);
          streamingRef.current = true;
        }
      },
      onClarifyRequest: (payload) => {
        if (!isCurrentSession()) return;
        flushStreamingMessage();
        followUp.clearFollowUpSuggestions();
        setClarifyPrompt(payload);
        setClarifySubmitError(null);
        setClarifySubmitting(false);
      },
      onResult: () => {
        if (!isCurrentSession()) {
          invalidateSessionByKey(callbackSessionKey);
          return;
        }
        sendingRef.current = false;
        streamActiveRef.current = false;
        runBusyRef.current = true;
        let appended: Message | null = null;
        if (streamingMsgRef.current) {
          finalizeStreamingThinking(streamingMsgRef.current.content);
          finalizeRunningTools(streamingMsgRef.current.content);
          appended = cloneMessageForRender(
            ensureAssistantMessage(streamingMsgRef.current, Date.now()),
          );
          flushStreamingMessage();
        }
        if (appended && hasRenderableAssistantContent(appended)) {
          const prior = displayMessagesRef.current;
          const withoutStreaming = prior.length > 0 && prior[prior.length - 1]?.role === 'assistant'
            ? prior.slice(0, -1)
            : prior;
          const merged = mergeConsecutiveAssistantMessages([...withoutStreaming, appended]);
          followUp.refreshFollowUpSuggestions({
            appended,
            messages: merged,
            clarifyActive: Boolean(clarifyPrompt),
          });
        }
        finalizeMessage(callbackSessionKey);
        if (followUpFlushTimerRef.current) {
          clearTimeout(followUpFlushTimerRef.current);
        }
        followUpFlushTimerRef.current = setTimeout(() => {
          void followUp.flushSteeringQueue(callbackSessionKey);
        }, FOLLOW_UP_AUTO_SEND_IDLE_MS);
      },
      onError: (msg) => {
        if (!isCurrentSession()) {
          invalidateSessionByKey(callbackSessionKey);
          return;
        }
        sendingRef.current = false;
        setStreaming(false);
        streamingRef.current = false;
        streamActiveRef.current = false;
        runBusyRef.current = awaitingSessionRefresh;
        streamingRef.current = false;
        clearStreamingMessage();
        setProgress(null);
        setClarifyPrompt(null);
        setClarifySubmitError(null);
        setClarifySubmitting(false);
        setError(msg);
        setAwaitingSessionRefresh(false);
        setSessionRefreshStartedAt(0);
        invalidateSession();
      },
    };
  }

  const send = useCallback(
    async (text: string, attachments?: WireAttachment[]): Promise<boolean> => {
      if (!canSendComposerDraft(text, attachments?.length ?? 0) || !sessionKey || streaming) {
        return false;
      }
      followUp.clearFollowUpSuggestions();
      sendingRef.current = true;
      streamActiveRef.current = true;
      runBusyRef.current = true;
      const userMsg = buildOptimisticUserMessage(text, attachments);
      setOptimisticMessages([userMsg]);
      clearStreamingMessage();
      setProgress(null);
      setClarifyPrompt(null);
      setClarifySubmitError(null);
      setClarifySubmitting(false);
      setError(null);
      setAwaitingSessionRefresh(false);
      setSessionRefreshStartedAt(0);
      try {
        await senderRef.current.sendMessage(
          text.trim(),
          sessionKey,
          buildCallbacks(sessionKey),
          attachments,
        );
        return true;
      } catch (e) {
        if (activeSessionKeyRef.current !== sessionKey) {
          invalidateSessionByKey(sessionKey);
          return true;
        }
        setOptimisticMessages([]);
        setError(e instanceof Error ? e.message : String(e));
        setStreaming(false);
        streamingRef.current = false;
        sendingRef.current = false;
        streamActiveRef.current = streaming || false;
        runBusyRef.current = streaming || awaitingSessionRefresh;
        return false;
      }
    },
    [sessionKey, streaming, awaitingSessionRefresh, invalidateSessionByKey, clearStreamingMessage, followUp],
  );

  sendRef.current = send;

  const sendVoice = useCallback(
    async (payload: { uri: string; durationMillis: number; mimeType?: string }) => {
      if (!payload.uri || !sessionKey || streaming || awaitingSessionRefresh) return;
      const userMsg: Message = {
        role: 'user-with-attachments',
        content: [
          {
            type: 'audio',
            uri: payload.uri,
            mimeType: payload.mimeType,
            name: 'voice.m4a',
            durationSeconds: Math.round(payload.durationMillis / 1000),
          },
        ],
        timestamp: Date.now(),
      };
      setOptimisticMessages([userMsg]);
      clearStreamingMessage();
      setProgress({
        stage: 'voice',
        message: m.chat.voiceSending,
        timestamp: Date.now(),
      });
      setClarifyPrompt(null);
      setClarifySubmitError(null);
      setClarifySubmitting(false);
      setError(null);
      setAwaitingSessionRefresh(false);
      setSessionRefreshStartedAt(0);
      try {
        await senderRef.current.sendVoiceMessage(
          payload,
          sessionKey,
          buildCallbacks(sessionKey),
        );
      } catch (e) {
        if (activeSessionKeyRef.current !== sessionKey) {
          invalidateSessionByKey(sessionKey);
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
        setStreaming(false);
        streamingRef.current = false;
        setProgress(null);
      }
    },
    [sessionKey, streaming, awaitingSessionRefresh, invalidateSessionByKey, clearStreamingMessage, m.chat.voiceSending],
  );

  const abort = useCallback(() => {
    setClarifyPrompt(null);
    setClarifySubmitError(null);
    setClarifySubmitting(false);
    senderRef.current.abort();
    if (streamingMsgRef.current) {
      finalizeStreamingThinking(streamingMsgRef.current.content);
      finalizeRunningTools(streamingMsgRef.current.content);
      flushStreamingMessage();
    }
    finalizeMessage();
  }, [finalizeMessage, flushStreamingMessage]);

  const submitClarifyAnswer = useCallback(async (answer: string) => {
    if (!clarifyPrompt || clarifySubmitting) return;
    setClarifySubmitting(true);
    setClarifySubmitError(null);
    try {
      await submitClarifyResponse(clarifyPrompt.requestId, { answer });
      setClarifyPrompt(null);
    } catch (e) {
      setClarifySubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setClarifySubmitting(false);
    }
  }, [clarifyPrompt, clarifySubmitting]);

  const skipClarifyAnswer = useCallback(async () => {
    if (!clarifyPrompt || clarifySubmitting) return;
    setClarifySubmitting(true);
    setClarifySubmitError(null);
    try {
      await submitClarifyResponse(clarifyPrompt.requestId, { skip: true });
      setClarifyPrompt(null);
    } catch (e) {
      setClarifySubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setClarifySubmitting(false);
    }
  }, [clarifyPrompt, clarifySubmitting]);

  const [pendingRunTick, setPendingRunTick] = useState(0);

  useEffect(() => {
    return subscribePendingAgentRunChanged((detail) => {
      if (detail.chatId === sessionKey) {
        setPendingRunTick((n) => n + 1);
      }
    });
  }, [sessionKey]);

  const pendingRunId = useMemo(() => {
    if (!sessionKey) return null;
    return readPendingAgentRunId(sessionKey);
  }, [sessionKey, streaming, pendingRunTick]);

  const resume = useCallback(async (opts?: AgentStreamResumeOptions) => {
    const background = opts?.background === true;
    const runId = pendingRunId ?? (sessionKey ? readPendingAgentRunId(sessionKey) : null);
    if (!sessionKey || !runId) return;
    if (senderRef.current.isStreamingFor(sessionKey)) return;
    if (!background && (streaming || awaitingSessionRefresh)) return;

    if (background) {
      setAwaitingSessionRefresh(false);
      setSessionRefreshStartedAt(0);
    } else {
      clearStreamingMessage();
      setAwaitingSessionRefresh(false);
      setSessionRefreshStartedAt(0);
    }
    setProgress(null);
    setStreaming(true);
    streamingRef.current = true;
    setError(null);
    try {
      await senderRef.current.resume(runId, sessionKey, buildCallbacks(sessionKey));
      autoResumeFailedRef.current = false;
    } catch (e) {
      if (activeSessionKeyRef.current !== sessionKey) {
        invalidateSessionByKey(sessionKey);
        return;
      }
      autoResumeFailedRef.current = true;
      setError(e instanceof Error ? e.message : String(e));
      setStreaming(false);
      streamingRef.current = false;
    }
  }, [
    sessionKey,
    pendingRunId,
    streaming,
    awaitingSessionRefresh,
    invalidateSessionByKey,
    clearStreamingMessage,
  ]);

  useAgentStreamResume({
    sessionKey,
    senderRef,
    activeSessionKeyRef,
    tryResume: resume,
    streaming,
  });

  // Auto-resume when a pending run id appears (e.g. stored from POST `status` before clear race).
  useEffect(() => {
    if (!pendingRunId || autoResumeFailedRef.current) return;
    if (senderRef.current.isStreamingFor(sessionKey)) return;
    if (streaming && !awaitingSessionRefresh) return;
    void resume({ background: awaitingSessionRefresh });
  }, [pendingRunId, streaming, awaitingSessionRefresh, resume, sessionKey]);

  useEffect(() => {
    return subscribeGatewayEvent('session-updated', (detail) => {
      const key = (detail as { key?: string }).key;
      if (key && key === sessionKey) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.webchatGoal(sessionKey) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.webchatGoalRuns(sessionKey, 1) });
      }
    });
  }, [queryClient, sessionKey]);

  useEffect(() => {
    return () => {
      senderRef.current.abort();
      clearStreamingFlushTimer();
    };
  }, [clearStreamingFlushTimer]);

  /** Create a fresh session when landing on home without `k`. */
  useEffect(() => {
    if (sessionKey || !configured || autoSessionStartedRef.current || creatingInitialSession) return;

    autoSessionStartedRef.current = true;
    setCreatingInitialSession(true);
    const agentId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
    void createSession(agentId)
      .then((key) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        router.replace({ pathname: '/', params: { k: key } });
      })
      .catch(() => {
        autoSessionStartedRef.current = false;
      })
      .finally(() => {
        setCreatingInitialSession(false);
      });
  }, [
    sessionKey,
    configured,
    creatingInitialSession,
    agentsQuery.data,
    localDefaultAgentId,
    router,
    queryClient,
  ]);

  // ── New chat ─────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    activeSessionKeyRef.current = '';
    senderRef.current.abort();
    clearStreamingMessage();
    setStreaming(false);
    streamingRef.current = false;
    setProgress(null);
    setClarifyPrompt(null);
    setClarifySubmitError(null);
    setClarifySubmitting(false);
    setError(null);
    setOptimisticMessages([]);
    setAwaitingSessionRefresh(false);
    setSessionRefreshStartedAt(0);

    const agentId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
    void createSession(agentId, { forceNew: true })
      .then((key) => {
        activeSessionKeyRef.current = key;
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        router.replace({ pathname: '/', params: { k: key } });
      })
      .catch((e) => {
        activeSessionKeyRef.current = sessionKey;
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [agentsQuery.data, localDefaultAgentId, queryClient, router, sessionKey, clearStreamingMessage]);

  // ── Open drawer ──────────────────────────────────────────
  const openDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);

  // ── Header / chrome colors (Kimi-like neutral + blue accent) ──
  const headerBg = isDark ? '#000000' : '#FFFFFF';
  const headerBorder = isDark ? '#38383A' : '#E5E5EA';
  const canvasBg = isDark ? '#000000' : '#F5F5F7';
  const pillText = isDark ? '#F5F5F7' : '#1C1C1E';
  const pillMuted = isDark ? '#8E8E93' : '#8E8E93';

  const chatSuggestions = useMemo(
    () => [m.chat.suggestion1, m.chat.suggestion2, m.chat.suggestion3],
    [m.chat.suggestion1, m.chat.suggestion2, m.chat.suggestion3],
  );

  const isEmptyChat =
    displayMessages.length === 0 && !streaming && !sessionQuery.isLoading;

  const composerDisabled =
    sessionQuery.isLoading || awaitingSessionRefresh || Boolean(clarifyPrompt);

  const queueFollowUpOrSend = useCallback(
    (text: string) => {
      sendOrQueueMessage({
        text,
        runBusy: runBusyRef.current,
        pendingCount: followUp.pendingFollowUps.length,
        send,
        addPendingFollowUp: (msg) => followUp.addPendingFollowUp(msg),
        onQueueFull: () => {
          setSnackMsg(t(m.chat.followUpQueueMaxReached, { max: MAX_PENDING_FOLLOW_UPS }));
        },
      });
    },
    [followUp, send, m.chat.followUpQueueMaxReached],
  );

  const handleStarterSend = useCallback(
    (text: string) => {
      queueFollowUpOrSend(text);
    },
    [queueFollowUpOrSend],
  );

  const handleGoalShortcutPress = useCallback(() => {
    if (composerDisabled) return;
    setComposerSuggestion(EMPTY_CHAT_GOAL_PREFILL);
  }, [composerDisabled]);

  const handleUserMessageCopy = useCallback((text: string) => {
    void Clipboard.setStringAsync(text)
      .then(() => setSnackMsg(m.chat.messageCopied))
      .catch(() => setSnackMsg(m.chat.messageCopyFailed));
  }, [m.chat.messageCopied, m.chat.messageCopyFailed]);

  const handleUserMessageEdit = useCallback((text: string) => {
    setComposerSuggestion(text);
    setSnackMsg(m.chat.messageReadyToEdit);
  }, [m.chat.messageReadyToEdit]);

  const handleUserMessageRetry = useCallback((text: string) => {
    if (!text.trim() || !sessionKey || streaming || awaitingSessionRefresh) return;
    void send(text);
  }, [send, sessionKey, streaming, awaitingSessionRefresh]);

  const handleDeleteRound = useCallback((timestamp?: number) => {
    if (!timestamp) return;
    // Remove user message + its associated assistant response from optimistic/display
    // For now, do a lightweight local removal from session messages via invalidation
    setSnackMsg(m.chat.messageRoundDeleted);
    // Invalidate to trigger fresh fetch (server side retains full history;
    // mobile simply removes from local display until server API supports delete)
    void queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionKey) });
  }, [queryClient, sessionKey, m.chat.messageRoundDeleted]);

  const handleAssistantCopy = useCallback((text: string) => {
    void Clipboard.setStringAsync(text)
      .then(() => setSnackMsg(m.chat.messageCopied))
      .catch(() => setSnackMsg(m.chat.messageCopyFailed));
  }, [m.chat.messageCopied, m.chat.messageCopyFailed]);

  const [agentSheetVisible, setAgentSheetVisible] = useState(false);
  const openAgentsPicker = useCallback(() => {
    setAgentSheetVisible(true);
  }, []);

  const handleAgentSelect = useCallback((agentId: string) => {
    // Start a new session with the selected agent
    void createSession(agentId, { forceNew: true }).then((key) => {
      activeSessionKeyRef.current = key;
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      router.replace({ pathname: '/', params: { k: key } });
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [queryClient, router]);

  const currentSessionAgentId = useMemo(() => {
    return sessionKey ? sessionKey.split(':')[0]?.trim().toLowerCase() ?? '' : '';
  }, [sessionKey]);

  const bootstrappingSession = !sessionKey && configured && creatingInitialSession;

  // ── Render: no session key → bootstrap or fallback ───────
  if (!sessionKey) {
    return (
      <View style={[styles.screen, { backgroundColor: canvasBg }]}>
        <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder, paddingTop: insets.top + 8 }]}>
          <View style={styles.headerLeft}>
            <IconButton icon="menu" size={22} onPress={openDrawer} />
          </View>
          <Pressable style={styles.headerTitleArea} onPress={openAgentsPicker}>
            <Text style={[styles.headerTitleText, { color: pillText }]} numberOfLines={1}>
              {modelName}
            </Text>
            <Text style={[styles.headerChevron, { color: pillMuted }]}>›</Text>
          </Pressable>
          <View style={styles.headerRight}>
            <IconButton icon="plus" size={22} onPress={handleNewChat} />
          </View>
        </View>
        <View style={styles.emptyContainer}>
          {bootstrappingSession ? (
            <ActivityIndicator size="large" />
          ) : (
            <>
              <Text variant="bodyLarge" style={{ opacity: 0.65 }}>{m.sessions.empty}</Text>
              <Text variant="bodySmall" style={{ opacity: 0.45, marginTop: 8, textAlign: 'center' }}>
                {m.sessions.emptyHint}
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: canvasBg }]}>
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder, paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <IconButton icon="menu" size={22} onPress={openDrawer} />
        </View>
        <Pressable style={styles.headerTitleArea} onPress={openAgentsPicker}>
          <Text style={[styles.headerTitleText, { color: pillText }]} numberOfLines={1}>
            {modelName}
          </Text>
          <Text style={[styles.headerChevron, { color: pillMuted }]}>›</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <IconButton icon="pencil-outline" size={22} onPress={() => setRenameVisible(true)} />
          <IconButton icon="plus" size={22} onPress={handleNewChat} />
        </View>
      </View>

      <View style={[styles.chatBody, { backgroundColor: canvasBg }]}>
        <GatewayOfflineBanner visible={configured && !gatewayOnline} />
        {error ? (
          <Banner visible icon="alert" actions={[{ label: m.chat.dismiss, onPress: () => setError(null) }]}>
            {error}
          </Banner>
        ) : null}
        {pendingRunId && !streaming && autoResumeFailedRef.current ? (
          <Banner
            visible
            icon="sync"
            actions={[{ label: m.chat.resumeButton, onPress: () => { autoResumeFailedRef.current = false; void resume({ background: true }); } }]}
          >
            {m.chat.resumeBanner}
          </Banner>
        ) : null}

        <GoalMissionCard sessionKey={sessionKey} agentBusy={streaming || awaitingSessionRefresh} />

        <View style={styles.listFill}>
          <MessageList
            messages={displayMessages}
            streaming={streaming}
            progress={progress}
            loading={sessionQuery.isLoading}
            sessionKey={sessionKey}
            welcomeTitle={m.chat.welcomeTitle}
            welcomeSubtitle={m.chat.welcomeSubtitle}
            suggestions={chatSuggestions}
            onSuggestionSend={handleStarterSend}
            onUserMessageCopy={handleUserMessageCopy}
            onUserMessageEdit={handleUserMessageEdit}
            onUserMessageRetry={handleUserMessageRetry}
            onDeleteRound={handleDeleteRound}
            onAssistantCopy={handleAssistantCopy}
            followUpSuggestions={followUp.followUpSuggestions}
            followUpDisabled={
              sessionQuery.isLoading ||
              awaitingSessionRefresh ||
              Boolean(clarifyPrompt)
            }
            onFollowUpPick={followUp.pickFollowUpSuggestion}
          />
        </View>

        <KeyboardStickyView
          offset={{ closed: 0, opened: 0 }}
          style={{ backgroundColor: canvasBg }}
        >
          <ClarifyPrompt
            prompt={clarifyPrompt}
            submitting={clarifySubmitting}
            submitError={clarifySubmitError}
            onSubmit={(answer) => void submitClarifyAnswer(answer)}
            onSkip={() => void skipClarifyAnswer()}
          />
          {isEmptyChat ? (
            <ChatEmptyShortcutsBar
              disabled={composerDisabled}
              onPressGoal={handleGoalShortcutPress}
            />
          ) : null}
          <ChatComposer
            disabled={composerDisabled}
            streaming={streaming}
            onSend={send}
            keyboardVisible={keyboardVisible}
            onSendVoice={(payload) => void sendVoice(payload)}
            onAbort={abort}
            placeholder={m.chat.inputPlaceholder}
            suggestionDraft={composerSuggestion}
            onConsumeSuggestionDraft={() => setComposerSuggestion(undefined)}
            onAddPendingFollowUp={(text, atts) => followUp.addPendingFollowUp(text, atts)}
            pendingFollowUps={followUp.pendingFollowUps}
            editingFollowUpId={followUp.editingFollowUpId}
            onBeginEditFollowUp={followUp.beginEditFollowUp}
            onCancelEditFollowUp={followUp.cancelEditFollowUp}
            onCommitEditFollowUp={followUp.commitEditFollowUp}
            onPendingFollowUpRemove={followUp.removePendingFollowUp}
            onPendingFollowUpMove={followUp.movePendingFollowUp}
            onPendingFollowUpSteer={(id) => void followUp.steerPendingFollowUp(id)}
            steeringFollowUpId={followUp.steeringFollowUpId}
            onQueueFull={() => setSnackMsg(t(m.chat.followUpQueueMaxReached, { max: MAX_PENDING_FOLLOW_UPS }))}
          />
          {!keyboardVisible ? (
            <Text
              style={[
                styles.aiDisclaimer,
                { color: pillMuted, paddingBottom: Math.max(10, insets.bottom) },
              ]}
            >
              {m.chat.aiDisclaimer}
            </Text>
          ) : null}
        </KeyboardStickyView>
      </View>

      {/* ── Dialogs ──────────────────────────────────── */}
      <RenameDialog
        visible={renameVisible}
        currentName={sessionName}
        onDismiss={() => setRenameVisible(false)}
        onRename={(name) => void handleRename(name)}
        loading={renameLoading}
      />

      <Snackbar
        visible={Boolean(snackMsg)}
        onDismiss={() => setSnackMsg('')}
        duration={2500}
      >
        {snackMsg}
      </Snackbar>

      <AgentPickerSheet
        visible={agentSheetVisible}
        agents={agentsQuery.data?.items ?? []}
        currentAgentId={currentSessionAgentId}
        onSelect={handleAgentSelect}
        onDismiss={() => setAgentSheetVisible(false)}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    width: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerRight: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerTitleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  headerChevron: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: -2,
  },
  // ── Chat body ──
  chatBody: {
    flex: 1,
  },
  /** Lets FlashList shrink when the keyboard opens (flex parent must allow min height 0). */
  listFill: {
    flex: 1,
    minHeight: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  aiDisclaimer: {
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
});
