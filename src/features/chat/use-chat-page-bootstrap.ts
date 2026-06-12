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

import { resolveEffectiveDefaultAgentId } from '../../query/agents';
import {
  ensureOptimisticSessionRegistered,
  takeOptimisticSessionKey,
} from './session-prefetch';
import { invalidateSessionLists } from '../../query/workspace-sync';
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
  /** When false, skip auto session creation (overlay supplies its own key). */
  shouldAutoBootstrap?: boolean;
};

export type ChatBootstrapResult = {
  pendingBootstrapKey: string;
  setPendingBootstrapKey: (key: string) => void;
  creatingInitialSession: boolean;
  bootstrapError: string | null;
  retryBootstrapSession: () => void;
  /** Force a fresh session when the workspace Ask AI overlay settles open. */
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
    shouldAutoBootstrap = true,
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
    setBootstrapError(null);
    const agentId = resolveEffectiveDefaultAgentId(agentsData, localDefaultAgentId);
    const key = takeOptimisticSessionKey(agentId);
    activeSessionKeyRef.current = key;
    setPendingBootstrapKey(key);
    setCreatingInitialSession(false);
    if (shouldNavigateToRoute) {
      openChat(router, key, { replace: true });
    }
    void ensureOptimisticSessionRegistered(key)
      .then(() => {
        invalidateSessionLists(queryClient);
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        setBootstrapError(message.trim() || m.sessions.bootstrapFailed);
      })
      .finally(() => {
        autoSessionInFlightRef.current = false;
      });
  }, [urlSessionKey, gatewayOnline, agentsData, localDefaultAgentId, router, queryClient, m.sessions.bootstrapFailed, activeSessionKeyRef, shouldNavigateToRoute]);

  // Auto-start on first mount when gateway is online
  useEffect(() => {
    if (!shouldAutoBootstrap || urlSessionKey || !gatewayOnline) return;
    if (autoSessionAttemptedRef.current || autoSessionInFlightRef.current) return;
    startAutoSession();
  }, [shouldAutoBootstrap, urlSessionKey, gatewayOnline, startAutoSession]);

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
