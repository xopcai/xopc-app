import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter } from 'expo-router';

import { prefetchNewChatSession, takeOptimisticSessionKey } from '../chat/session-prefetch';
import { useEffectiveDefaultAgentId } from '../../query/agents';
import { openChat } from '../../lib/navigation';

import { useOptionalWorkspaceTransition } from './workspace-transition-context';

import type { FinalizeAskAiHandler } from './workspace-transition.types';

export type WorkspaceNavigationValue = {
  openAskAi: () => void;
  prefetchAskAiSession: () => void;
  registerFinalizeHandler: (handler: FinalizeAskAiHandler | null) => void;
};

const WorkspaceNavigationContext = createContext<WorkspaceNavigationValue | null>(null);

type WorkspaceNavigationProviderProps = {
  children: ReactNode;
};

export function WorkspaceNavigationProvider({ children }: WorkspaceNavigationProviderProps) {
  const router = useRouter();
  const transition = useOptionalWorkspaceTransition();
  const defaultAgentId = useEffectiveDefaultAgentId();

  const prefetchAskAiSession = useCallback(() => {
    prefetchNewChatSession(defaultAgentId, { forceNew: true });
  }, [defaultAgentId]);

  const registerFinalizeHandler = useCallback(
    (handler: FinalizeAskAiHandler | null) => {
      transition?.registerFinalizeHandler(handler);
    },
    [transition],
  );

    const openAskAi = useCallback(() => {
    if (transition) {
      const sessionKey = takeOptimisticSessionKey(defaultAgentId);
      void transition.openAskAi(sessionKey);
      return;
    }
    const sessionKey = takeOptimisticSessionKey(defaultAgentId);
    openChat(router, sessionKey);
  }, [defaultAgentId, router, transition]);
  const value = useMemo(
    () => ({ openAskAi, prefetchAskAiSession, registerFinalizeHandler }),
    [openAskAi, prefetchAskAiSession, registerFinalizeHandler],
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
        openAskAi: () => {
          const sessionKey = takeOptimisticSessionKey(defaultAgentId);
          openChat(router, sessionKey);
        },
        prefetchAskAiSession: () => prefetchNewChatSession(defaultAgentId, { forceNew: true }),
        registerFinalizeHandler: () => {},
      },
    [ctx, defaultAgentId, router],
  );
}
