/**
 * Encapsulates the "auto-create session on cold start" logic.
 *
 * On first mount (or after gateway reconnect), if no session key exists in the
 * URL, we create one in the background so the user lands on a ready-to-type
 * chat. Retries on gateway reconnect after a prior failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { openChat } from '../../lib/navigation';

import { useGatewayStore } from '../../stores/gateway-store';
import { createSession } from '../../query/sessions';
import { resolveEffectiveDefaultAgentId } from '../../query/agents';
import { consumePrefetchedSession } from './session-prefetch';
import { queryKeys } from '../../query/keys';
import type { useMessages } from '../../i18n/messages';

export type ChatBootstrapDeps = {
  urlSessionKey: string;
  gatewayOnline: boolean;
  agentsData: Parameters<typeof resolveEffectiveDefaultAgentId>[0];
  localDefaultAgentId: string;
  messages: ReturnType<typeof useMessages>;
  /** Shared mutable ref — bootstrap writes the new session key here so callers stay in sync. */
  activeSessionKeyRef: React.MutableRefObject<string>;
  shouldNavigateToRoute?: boolean;
};

export type ChatBootstrapResult = {
  pendingBootstrapKey: string;
  setPendingBootstrapKey: (key: string) => void;
  creatingInitialSession: boolean;
  bootstrapError: string | null;
  retryBootstrapSession: () => void;
  /** Force a fresh session (embedded pager "问 AI" from home). */
  startFreshSession: () => void;
};

export function useChatPageBootstrap(deps: ChatBootstrapDeps): ChatBootstrapResult {
  const {
    urlSessionKey,
    gatewayOnline,
    agentsData,
    localDefaultAgentId,
    messages: m,
    activeSessionKeyRef,
    shouldNavigateToRoute = true,
  } = deps;

  const router = useRouter();
  const queryClient = useQueryClient();

  const [pendingBootstrapKey, setPendingBootstrapKey] = useState('');
  const [creatingInitialSession, setCreatingInitialSession] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const autoSessionAttemptedRef = useRef(false);
  const autoSessionInFlightRef = useRef(false);
  const prevGatewayOnlineRef = useRef(gatewayOnline);

  useEffect(() => {
    if (urlSessionKey) setPendingBootstrapKey('');
  }, [urlSessionKey]);

  const resolveNewSessionKey = useCallback(async (agentId: string) => {
    await useGatewayStore.getState().refreshActiveBaseUrl();
    const prefetched = consumePrefetchedSession(agentId, { forceNew: true });
    return prefetched ?? createSession(agentId, { forceNew: true });
  }, []);

  const startAutoSession = useCallback((options?: { force?: boolean }) => {
    if (urlSessionKey || !gatewayOnline) return;
    if (autoSessionInFlightRef.current && !options?.force) return;
    if (autoSessionAttemptedRef.current && !options?.force) return;

    if (options?.force) {
      autoSessionAttemptedRef.current = false;
      autoSessionInFlightRef.current = false;
      setPendingBootstrapKey('');
      activeSessionKeyRef.current = '';
    }

    autoSessionAttemptedRef.current = true;
    autoSessionInFlightRef.current = true;
    setCreatingInitialSession(true);
    setBootstrapError(null);
    const agentId = resolveEffectiveDefaultAgentId(agentsData, localDefaultAgentId);
    void (async () => {
      try {
        const key = await resolveNewSessionKey(agentId);
        activeSessionKeyRef.current = key;
        setPendingBootstrapKey(key);
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
        if (shouldNavigateToRoute) {
          openChat(router, key, { replace: true });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setBootstrapError(message.trim() || m.sessions.bootstrapFailed);
      } finally {
        autoSessionInFlightRef.current = false;
        setCreatingInitialSession(false);
      }
    })();
  }, [urlSessionKey, gatewayOnline, agentsData, localDefaultAgentId, router, queryClient, m.sessions.bootstrapFailed, activeSessionKeyRef, shouldNavigateToRoute, resolveNewSessionKey]);

  // Auto-start on first mount when gateway is online
  useEffect(() => {
    if (urlSessionKey || !gatewayOnline) return;
    if (autoSessionAttemptedRef.current || autoSessionInFlightRef.current) return;
    startAutoSession();
  }, [urlSessionKey, gatewayOnline, startAutoSession]);

  // Retry on gateway reconnect after a failure
  useEffect(() => {
    const wasOffline = !prevGatewayOnlineRef.current;
    prevGatewayOnlineRef.current = gatewayOnline;
    if (!wasOffline || !gatewayOnline || !bootstrapError || urlSessionKey) return;
    autoSessionAttemptedRef.current = false;
    setBootstrapError(null);
    startAutoSession();
  }, [gatewayOnline, bootstrapError, urlSessionKey, startAutoSession]);

  const retryBootstrapSession = useCallback(() => {
    if (urlSessionKey || !gatewayOnline || autoSessionInFlightRef.current) return;
    autoSessionAttemptedRef.current = false;
    startAutoSession();
  }, [urlSessionKey, gatewayOnline, startAutoSession]);

  const startFreshSession = useCallback(() => {
    if (urlSessionKey || !gatewayOnline) return;
    startAutoSession({ force: true });
  }, [urlSessionKey, gatewayOnline, startAutoSession]);

  return {
    pendingBootstrapKey,
    setPendingBootstrapKey,
    creatingInitialSession,
    bootstrapError,
    retryBootstrapSession,
    startFreshSession,
  };
}
