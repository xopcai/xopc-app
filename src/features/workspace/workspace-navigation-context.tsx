import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useRouter } from 'expo-router';

import { prefetchNewChatSession } from '../chat/session-prefetch';
import { useEffectiveDefaultAgentId } from '../../query/agents';

type EmbeddedAskAiHandler = () => void;

export type WorkspaceNavigationValue = {
  openAskAi: () => void;
  prefetchAskAiSession: () => void;
  registerEmbeddedAskAiHandler: (handler: EmbeddedAskAiHandler | null) => void;
};

const WorkspaceNavigationContext = createContext<WorkspaceNavigationValue | null>(null);

type WorkspaceNavigationProviderProps = {
  children: ReactNode;
  /** Native pager: switch to the embedded chat page after preparing a session. */
  onOpenAskAiNative?: () => void;
};

export function WorkspaceNavigationProvider({
  children,
  onOpenAskAiNative,
}: WorkspaceNavigationProviderProps) {
  const router = useRouter();
  const embeddedHandlerRef = useRef<EmbeddedAskAiHandler | null>(null);
  const defaultAgentId = useEffectiveDefaultAgentId();

  const prefetchAskAiSession = useCallback(() => {
    prefetchNewChatSession(defaultAgentId, { forceNew: true });
  }, [defaultAgentId]);

  const registerEmbeddedAskAiHandler = useCallback((handler: EmbeddedAskAiHandler | null) => {
    embeddedHandlerRef.current = handler;
  }, []);

  const openAskAi = useCallback(() => {
    prefetchAskAiSession();
    if (onOpenAskAiNative) {
      embeddedHandlerRef.current?.();
      onOpenAskAiNative();
      return;
    }
    router.push('/chat');
  }, [onOpenAskAiNative, prefetchAskAiSession, router]);

  const value = useMemo(
    () => ({ openAskAi, prefetchAskAiSession, registerEmbeddedAskAiHandler }),
    [openAskAi, prefetchAskAiSession, registerEmbeddedAskAiHandler],
  );

  return (
    <WorkspaceNavigationContext.Provider value={value}>
      {children}
    </WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigation(): WorkspaceNavigationValue {
  const ctx = useContext(WorkspaceNavigationContext);
  const router = useRouter();
  const defaultAgentId = useEffectiveDefaultAgentId();

  return useMemo(
    () =>
      ctx ?? {
        openAskAi: () => router.push('/chat'),
        prefetchAskAiSession: () => prefetchNewChatSession(defaultAgentId, { forceNew: true }),
        registerEmbeddedAskAiHandler: () => {},
      },
    [ctx, defaultAgentId, router],
  );
}
