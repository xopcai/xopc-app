/**
 * Encapsulates the "auto-create session on cold start" logic.
 *
 * On first mount, if no session key exists in the URL, we assign a local
 * optimistic key so the user lands on a ready-to-type chat. Server registration
 * is deferred until the first message send.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import { openChat } from '../../lib/navigation';

import { resolveEffectiveDefaultAgentId } from '../../query/agents';
import { takeOptimisticSessionKey } from './session-prefetch';
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
    activeSessionKeyRef,
    shouldNavigateToRoute = true,
    shouldAutoBootstrap = true,
  } = deps;

  const router = useRouter();

  const [pendingBootstrapKey, setPendingBootstrapKey] = useState('');
  const [creatingInitialSession] = useState(false);
  const [bootstrapError] = useState<string | null>(null);
  const autoSessionAttemptedRef = useRef(false);

  useEffect(() => {
    if (urlSessionKey) setPendingBootstrapKey('');
  }, [urlSessionKey]);

  const startAutoSession = useCallback((options?: { force?: boolean }) => {
    if (urlSessionKey || !gatewayOnline) return;
    if (autoSessionAttemptedRef.current && !options?.force) return;

    if (options?.force) {
      autoSessionAttemptedRef.current = false;
      setPendingBootstrapKey('');
      activeSessionKeyRef.current = '';
    }

    autoSessionAttemptedRef.current = true;
    const agentId = resolveEffectiveDefaultAgentId(agentsData, localDefaultAgentId);
    const key = takeOptimisticSessionKey(agentId);
    activeSessionKeyRef.current = key;
    setPendingBootstrapKey(key);
    if (shouldNavigateToRoute) {
      openChat(router, key, { replace: true });
    }
  }, [urlSessionKey, gatewayOnline, agentsData, localDefaultAgentId, router, activeSessionKeyRef, shouldNavigateToRoute]);

  // Auto-start on first mount when gateway is online
  useEffect(() => {
    if (!shouldAutoBootstrap || urlSessionKey || !gatewayOnline) return;
    if (autoSessionAttemptedRef.current) return;
    startAutoSession();
  }, [shouldAutoBootstrap, urlSessionKey, gatewayOnline, startAutoSession]);

  const retryBootstrapSession = useCallback(() => {
    if (urlSessionKey || !gatewayOnline) return;
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
