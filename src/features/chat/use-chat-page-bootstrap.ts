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

  const startAutoSession = useCallback(() => {
    if (urlSessionKey || !gatewayOnline || autoSessionInFlightRef.current) return;

    autoSessionAttemptedRef.current = true;
    autoSessionInFlightRef.current = true;
    setCreatingInitialSession(true);
    setBootstrapError(null);
    const agentId = resolveEffectiveDefaultAgentId(agentsData, localDefaultAgentId);
    void (async () => {
      try {
        await useGatewayStore.getState().refreshActiveBaseUrl();
        const key = await createSession(agentId);
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
  }, [urlSessionKey, gatewayOnline, agentsData, localDefaultAgentId, router, queryClient, m.sessions.bootstrapFailed, activeSessionKeyRef, shouldNavigateToRoute]);

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

  return {
    pendingBootstrapKey,
    setPendingBootstrapKey,
    creatingInitialSession,
    bootstrapError,
    retryBootstrapSession,
  };
}
