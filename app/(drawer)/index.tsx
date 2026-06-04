/**
 * Chat screen — the main page inside the drawer.
 *
 * Header layout:
 *   Left:   menu
 *   Center: agent name + model dropdown
 *   Right:  new chat
 */
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerActions } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Banner, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposer } from '../../src/features/chat/ChatComposer';
import { ChatStreamNotice } from '../../src/features/chat/ChatStreamNotice';
import { ClarifyPrompt } from '../../src/features/chat/ClarifyPrompt';
import { AgentPickerSheet } from '../../src/features/chat/AgentPickerSheet';
import { ChatHeader } from '../../src/features/chat/ChatHeader';
import { GatewayPickerSheet } from '../../src/features/chat/GatewayPickerSheet';
import { ChatEmptyShortcutsBar } from '../../src/features/chat/ChatEmptyShortcutsBar';
import { EMPTY_CHAT_GOAL_PREFILL } from '../../src/features/chat/chat-empty-shortcuts';
import { GoalMissionCard } from '../../src/features/chat/GoalMissionCard';
import { MessageList } from '../../src/features/chat/MessageList';
import {
  buildUserResendPayload, findPrecedingUserMessage,
} from '../../src/features/chat/composer-send-helpers';
import { syncAfterGatewaySettingsSave } from '../../src/features/gateway/gateway-connection-sync';
import { useGatewayHealth } from '../../src/features/gateway/use-gateway-health';
import { GlobalConnectionStatusBar } from '../../src/features/gateway/GlobalConnectionStatusBar';
import { useGatewayConnectLanding } from '../../src/features/gateway/gateway-connect-context';
import { RouteOverrideToastView } from '../../src/features/gateway/RouteOverrideToastView';
import { useRouteOverrideToast } from '../../src/features/gateway/use-route-override-toast';
import { useRouteSwitchToast } from '../../src/features/gateway/use-route-switch-toast';
import { useKeyboardVisible } from '../../src/hooks/use-keyboard-visible';
import { usePreferencesStore } from '../../src/stores/preferences-store';
import { useGatewayStore } from '../../src/stores/gateway-store';
import { useMessages } from '../../src/i18n/messages';
import {
  fetchChatAgents,
  readPlaceholderAgents,
  resolveEffectiveDefaultAgentId,
} from '../../src/query/agents';
import { fetchChatModels, resolveEffectiveModelId, setSessionModelRef } from '../../src/query/models';
import { queryKeys } from '../../src/query/keys';
import { createSession } from '../../src/query/sessions';
import { useSessionHistory } from '../../src/features/chat/use-session-history';
import { useChatSession } from '../../src/features/chat/use-chat-session';
import {
  parseSessionMessages,
  dedupeWireMessages,
  appendOlderSessionHistoryPage,
} from '../../src/features/chat/session-message-parser';
import type { Message } from '../../src/features/chat/messages.types';
import { sendOrQueueMessage } from '../../src/features/chat/send-or-queue';
import { MAX_PENDING_FOLLOW_UPS } from '../../src/features/chat/pending-follow-up.types';
import { t } from '../../src/i18n/messages';

export default function ChatScreen() {
  const { k: rawKey } = useLocalSearchParams<{ k?: string }>();
  const urlSessionKey =
    typeof rawKey === 'string' ? rawKey : Array.isArray(rawKey) ? rawKey[0] : '';
  const [pendingBootstrapKey, setPendingBootstrapKey] = useState('');
  const sessionKey = urlSessionKey || pendingBootstrapKey;
  const navigation = useNavigation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { gatewayOnline } = useGatewayHealth();
  const routeSwitchToast = useRouteSwitchToast();
  const routeOverrideToast = useRouteOverrideToast();
  const gatewayProfiles = useGatewayStore((s) => s.profiles);
  const activeGatewayId = useGatewayStore((s) => s.activeGatewayId);
  const switchGateway = useGatewayStore((s) => s.switchGateway);
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const m = useMessages();

  // ── Agent / model info ───────────────────────────────────
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: true,
    placeholderData: () => readPlaceholderAgents() ?? undefined,
  });

  const localDefaultAgentId = usePreferencesStore((s) => s.defaultAgentId) ?? '';
  const localSelectedModelRef = usePreferencesStore((s) => s.selectedModelRef);
  const setSelectedModelRef = usePreferencesStore((s) => s.setSelectedModelRef);

  const [creatingInitialSession, setCreatingInitialSession] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const autoSessionAttemptedRef = useRef(false);
  const autoSessionInFlightRef = useRef(false);
  const prevGatewayOnlineBootRef = useRef(gatewayOnline);

  useEffect(() => {
    if (urlSessionKey) setPendingBootstrapKey('');
  }, [urlSessionKey]);

  const currentSessionAgentId = useMemo(() => {
    return sessionKey ? sessionKey.split(':')[0]?.trim().toLowerCase() ?? '' : '';
  }, [sessionKey]);

  const modelsQuery = useQuery({
    queryKey: queryKeys.models(currentSessionAgentId),
    queryFn: () => fetchChatModels(currentSessionAgentId || undefined),
    enabled: true,
  });

  const effectiveModelId = resolveEffectiveModelId(modelsQuery.data, localSelectedModelRef);

  const agentName = useMemo(() => {
    const agents = agentsQuery.data?.items ?? [];
    const defaultId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
    const sessionAgentId = currentSessionAgentId || defaultId;
    const agent = agents.find((a) => a.id === sessionAgentId);
    return agent?.name ?? agent?.id ?? sessionAgentId;
  }, [agentsQuery.data, currentSessionAgentId, localDefaultAgentId]);

  const modelName = useMemo(() => {
    const models = modelsQuery.data?.items ?? [];
    if (!models.length) return m.chat.modelPickerSelect;
    const model = models.find((item) => item.id === effectiveModelId);
    return model?.name ?? model?.id ?? (effectiveModelId || m.chat.modelPickerSelect);
  }, [effectiveModelId, m.chat.modelPickerSelect, modelsQuery.data?.items]);

  // ── Session history ──────────────────────────────────────
  const { sessionHistoryQuery } = useSessionHistory(sessionKey);

  // ── Chat session (streaming / send / resume) ─────────────
  const chat = useChatSession({ sessionKey, effectiveModelId });

  // ── Bootstrap (auto-create session on landing) ───────────
  const startAutoSession = useCallback(() => {
    if (urlSessionKey || !gatewayOnline || autoSessionInFlightRef.current) return;

    autoSessionAttemptedRef.current = true;
    autoSessionInFlightRef.current = true;
    setCreatingInitialSession(true);
    setBootstrapError(null);
    const agentId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
    void (async () => {
      try {
        await useGatewayStore.getState().refreshActiveBaseUrl();
        const key = await createSession(agentId);
        chat.activeSessionKeyRef.current = key;
        setPendingBootstrapKey(key);
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
        router.replace({ pathname: '/', params: { k: key } });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setBootstrapError(message.trim() || m.sessions.bootstrapFailed);
      } finally {
        autoSessionInFlightRef.current = false;
        setCreatingInitialSession(false);
      }
    })();
  }, [
    urlSessionKey,
    gatewayOnline,
    agentsQuery.data,
    localDefaultAgentId,
    router,
    queryClient,
    m.sessions.bootstrapFailed,
    chat.activeSessionKeyRef,
  ]);

  useEffect(() => {
    if (urlSessionKey || !gatewayOnline) return;
    if (autoSessionAttemptedRef.current || autoSessionInFlightRef.current) return;
    startAutoSession();
  }, [urlSessionKey, gatewayOnline, startAutoSession]);

  const retryBootstrapSession = useCallback(() => {
    if (urlSessionKey || !gatewayOnline || autoSessionInFlightRef.current) return;
    autoSessionAttemptedRef.current = false;
    startAutoSession();
  }, [urlSessionKey, gatewayOnline, startAutoSession]);

  useEffect(() => {
    const wasOffline = !prevGatewayOnlineBootRef.current;
    prevGatewayOnlineBootRef.current = gatewayOnline;
    if (!wasOffline || !gatewayOnline || !bootstrapError || urlSessionKey) return;
    autoSessionAttemptedRef.current = false;
    setBootstrapError(null);
    startAutoSession();
  }, [gatewayOnline, bootstrapError, urlSessionKey, startAutoSession]);

  // ── Parsed messages ──────────────────────────────────────
  const sessionMessages = useMemo<Message[]>(() => {
    const pages = sessionHistoryQuery.data?.pages ?? [];
    const raw = [...pages]
      .reverse()
      .flatMap((page) => page?.session.messages ?? []);
    if (!raw.length) return [];
    return parseSessionMessages(dedupeWireMessages(raw as Array<Record<string, unknown>>));
  }, [sessionHistoryQuery.data?.pages]);

  const sessionRefreshComplete =
    chat.awaitingSessionRefresh && sessionHistoryQuery.dataUpdatedAt > chat.sessionDataUpdatedAtRef.current;

  const displayMessages = useMemo<Message[]>(() => {
    if (sessionRefreshComplete) return sessionMessages;

    const base = chat.optimisticMessages.length > 0
      ? [...sessionMessages, ...chat.optimisticMessages]
      : sessionMessages;
    if (!chat.streamingMsg) return base;
    return [...base, chat.streamingMsg];
  }, [sessionRefreshComplete, sessionMessages, chat.optimisticMessages, chat.streamingMsg]);

  useEffect(() => {
    chat.displayMessagesRef.current = displayMessages;
  }, [displayMessages, chat.displayMessagesRef]);

  // Refresh-complete cleanup
  useEffect(() => {
    if (!sessionRefreshComplete) return;
    chat.clearAllState();
  }, [sessionRefreshComplete, chat]);

  // ── Header ───────────────────────────────────────────────
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const headerBg = isDark ? '#000000' : '#FFFFFF';
  const headerBorder = isDark ? '#38383A' : '#E5E5EA';
  const canvasBg = isDark ? '#000000' : '#F5F5F7';
  const pillText = isDark ? '#F5F5F7' : '#1C1C1E';
  const pillMuted = isDark ? '#8E8E93' : '#8E8E93';

  // ── Derived UI state ─────────────────────────────────────
  const chatSuggestions = useMemo(
    () => [m.chat.suggestion1, m.chat.suggestion2, m.chat.suggestion3],
    [m.chat.suggestion1, m.chat.suggestion2, m.chat.suggestion3],
  );

  const isEmptyChat =
    displayMessages.length === 0 && !chat.streaming && !sessionHistoryQuery.isLoading;

  // Keep the composer interactive even when the gateway is unreachable —
  // sendOrQueueMessage queues offline sends and the global status bar
  // tells the user what's happening. Disabling it on connectivity blips
  // makes the app feel dead for transient hiccups.
  const composerDisabled =
    !sessionKey ||
    creatingInitialSession ||
    sessionHistoryQuery.isLoading ||
    Boolean(chat.clarifyPrompt);

  // ── Handlers ─────────────────────────────────────────────
  const openDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModelRef(modelId);
    if (sessionKey) {
      void setSessionModelRef(sessionKey, modelId).catch(() => {});
    }
  }, [sessionKey, setSelectedModelRef]);

  const handleAgentSelect = useCallback((agentId: string) => {
    void createSession(agentId, { forceNew: true }).then((key) => {
      chat.activeSessionKeyRef.current = key;
      setPendingBootstrapKey(key);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      router.replace({ pathname: '/', params: { k: key } });
    }).catch((e) => {
      chat.setSnackMsg(e instanceof Error ? e.message : String(e));
    });
  }, [queryClient, router, chat.setSnackMsg, chat.activeSessionKeyRef]);

  const handleNewChat = useCallback(() => {
    chat.activeSessionKeyRef.current = '';
    chat.streamRecoveryRef.current.cancelRecovery();
    chat.clearAllState();

    const agentId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
    void createSession(agentId, { forceNew: true })
      .then((key) => {
        chat.activeSessionKeyRef.current = key;
        setPendingBootstrapKey(key);
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
        router.replace({ pathname: '/', params: { k: key } });
      })
      .catch((e) => {
        chat.activeSessionKeyRef.current = sessionKey;
        chat.setSnackMsg(e instanceof Error ? e.message : String(e));
      });
  }, [agentsQuery.data, localDefaultAgentId, queryClient, router, sessionKey, chat]);

  const queueFollowUpOrSend = useCallback(
    (text: string) => {
      sendOrQueueMessage({
        text,
        runBusy: chat.runningRef.current,
        pendingCount: chat.followUp.pendingFollowUps.length,
        send: chat.send,
        addPendingFollowUp: (msg) => chat.followUp.addPendingFollowUp(msg),
        onQueueFull: () => {
          chat.setSnackMsg(t(m.chat.followUpQueueMaxReached, { max: MAX_PENDING_FOLLOW_UPS }));
        },
      });
    },
    [chat, m.chat.followUpQueueMaxReached],
  );

  const handleStarterSend = useCallback(
    (text: string) => queueFollowUpOrSend(text),
    [queueFollowUpOrSend],
  );

  const [composerSuggestion, setComposerSuggestion] = useState<string | undefined>(undefined);

  const handleGoalShortcutPress = useCallback(() => {
    if (composerDisabled) return;
    setComposerSuggestion(EMPTY_CHAT_GOAL_PREFILL);
  }, [composerDisabled]);

  const handleUserMessageCopy = useCallback((text: string) => {
    void Clipboard.setStringAsync(text)
      .then(() => chat.setSnackMsg(m.chat.messageCopied))
      .catch(() => chat.setSnackMsg(m.chat.messageCopyFailed));
  }, [m.chat.messageCopied, m.chat.messageCopyFailed, chat.setSnackMsg]);

  const handleUserMessageEdit = useCallback((text: string) => {
    setComposerSuggestion(text);
    chat.setSnackMsg(m.chat.messageReadyToEdit);
  }, [m.chat.messageReadyToEdit, chat.setSnackMsg]);

  const handleAssistantCopy = useCallback((text: string) => {
    void Clipboard.setStringAsync(text)
      .then(() => chat.setSnackMsg(m.chat.messageCopied))
      .catch(() => chat.setSnackMsg(m.chat.messageCopyFailed));
  }, [m.chat.messageCopied, m.chat.messageCopyFailed, chat.setSnackMsg]);

  const handleAssistantRegenerate = useCallback((assistantIndex: number) => {
    if (!sessionKey || chat.streaming || chat.awaitingSessionRefresh || Boolean(chat.clarifyPrompt)) return;
    const userMessage = findPrecedingUserMessage(displayMessages, assistantIndex);
    if (!userMessage) return;
    const payload = buildUserResendPayload(userMessage);
    if (!payload) return;
    void chat.send(payload.text, payload.attachments);
  }, [chat, displayMessages, sessionKey]);

  const [agentSheetVisible, setAgentSheetVisible] = useState(false);
  const [gatewaySheetVisible, setGatewaySheetVisible] = useState(false);
  const [switchingGatewayId, setSwitchingGatewayId] = useState<string | null>(null);

  const openAgentsPicker = useCallback(() => setAgentSheetVisible(true), []);

  const handleGatewaySelect = useCallback(
    async (profileId: string) => {
      if (profileId === activeGatewayId) { setGatewaySheetVisible(false); return; }
      setSwitchingGatewayId(profileId);
      try {
        switchGateway(profileId);
        await syncAfterGatewaySettingsSave();
        const agentId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
        const key = await createSession(agentId, { forceNew: true });
        chat.activeSessionKeyRef.current = key;
        setPendingBootstrapKey(key);
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
        setGatewaySheetVisible(false);
        router.replace({ pathname: '/', params: { k: key } });
      } catch (e) {
        chat.setSnackMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setSwitchingGatewayId(null);
      }
    },
    [activeGatewayId, agentsQuery.data, localDefaultAgentId, queryClient, router, switchGateway, chat],
  );

  const { openGatewayConnectLanding } = useGatewayConnectLanding();
  const openReconnectLanding = useCallback(() => {
    openGatewayConnectLanding?.();
  }, [openGatewayConnectLanding]);

  const handleGatewayManageSettings = useCallback(() => {
    setGatewaySheetVisible(false);
    router.push('/settings/gateway');
  }, [router]);

  const handleGatewayAdd = useCallback(() => {
    setGatewaySheetVisible(false);
    router.push('/settings/gateway/new');
  }, [router]);

  const headerPaddingTop = insets.top + 8;

  // ── Picker sheets ────────────────────────────────────────
  const pickerSheets = (
    <>
      <AgentPickerSheet
        visible={agentSheetVisible}
        agents={agentsQuery.data?.items ?? []}
        currentAgentId={currentSessionAgentId}
        onSelect={handleAgentSelect}
        onDismiss={() => setAgentSheetVisible(false)}
      />
      <GatewayPickerSheet
        visible={gatewaySheetVisible}
        profiles={gatewayProfiles}
        activeGatewayId={activeGatewayId}
        gatewayOnline={gatewayOnline}
        switchingId={switchingGatewayId}
        onSelect={(id) => void handleGatewaySelect(id)}
        onManageSettings={handleGatewayManageSettings}
        onAddGateway={handleGatewayAdd}
        onDismiss={() => setGatewaySheetVisible(false)}
      />
    </>
  );

  // ── Render ───────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: canvasBg }]}>
      <ChatHeader
        agentName={agentName}
        modelName={modelName}
        models={modelsQuery.data?.items ?? []}
        currentModelId={effectiveModelId}
        paddingTop={headerPaddingTop}
        headerBg={headerBg}
        headerBorder={headerBorder}
        pillText={pillText}
        pillMuted={pillMuted}
        onMenuPress={openDrawer}
        onAgentPress={openAgentsPicker}
        onModelSelect={handleModelSelect}
        onNewChat={handleNewChat}
      />

      <GlobalConnectionStatusBar
        onOpenSettings={handleGatewayManageSettings}
        onReconnect={openReconnectLanding}
      />

      <View style={[styles.chatBody, { backgroundColor: canvasBg }]}>
        {!urlSessionKey && bootstrapError ? (
          <Banner
            visible
            icon="alert"
            actions={[{ label: m.common.retry, onPress: retryBootstrapSession }]}
          >
            {bootstrapError}
          </Banner>
        ) : null}
        {!urlSessionKey && creatingInitialSession ? (
          <View style={styles.bootstrapRow}>
            <ActivityIndicator size="small" />
            <Text variant="bodySmall" style={{ opacity: 0.65 }}>{m.common.loading}</Text>
          </View>
        ) : null}
        <ChatStreamNotice
          isDark={isDark}
          reconnecting={chat.streamReconnecting}
          reconnectingLabel={m.chat.streamReconnecting}
          resumeVisible={
            !chat.streaming && chat.resumePromptVisible && !chat.streamReconnecting
          }
          resumeLabel={m.chat.resumeBanner}
          resumeActionLabel={m.chat.resumeButton}
          onResume={() => {
            void chat.resume({ background: true });
          }}
        />

        <GoalMissionCard
          sessionKey={sessionKey}
          agentBusy={chat.streaming || chat.awaitingSessionRefresh}
        />

        <View style={styles.listFill}>
          <MessageList
            messages={displayMessages}
            streaming={chat.streaming}
            progress={chat.progress}
            loading={sessionHistoryQuery.isLoading || (!sessionKey && creatingInitialSession)}
            loadingOlder={sessionHistoryQuery.isFetchingNextPage}
            hasOlder={sessionHistoryQuery.hasNextPage}
            onLoadOlder={() => {
              if (!sessionHistoryQuery.hasNextPage || sessionHistoryQuery.isFetchingNextPage) return;
              const loadedPages = sessionHistoryQuery.data?.pages ?? [];
              const lastLoadedPage = loadedPages[loadedPages.length - 1];
              const olderCursor = lastLoadedPage?.pagination.nextBeforeCursor;
              if (!olderCursor) { void sessionHistoryQuery.fetchNextPage(); return; }

              const prefetchedOlderPage = queryClient.getQueryData(
                queryKeys.sessionHistoryOlderPreview(sessionKey, olderCursor),
              );

              if (prefetchedOlderPage) {
                queryClient.setQueryData(
                  queryKeys.sessionHistory(sessionKey),
                  (oldData) => appendOlderSessionHistoryPage(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    oldData as any,
                    prefetchedOlderPage as Parameters<typeof appendOlderSessionHistoryPage>[1],
                    olderCursor,
                  ),
                );
                return;
              }

              void sessionHistoryQuery.fetchNextPage();
            }}
            onAtBottomChange={(isAtBottom) => {
              chat.messageListAtBottomRef.current = isAtBottom;
            }}
            sessionKey={sessionKey}
            welcomeTitle={m.chat.welcomeTitle}
            welcomeSubtitle={m.chat.welcomeSubtitle}
            suggestions={chatSuggestions}
            onSuggestionSend={handleStarterSend}
            onUserMessageCopy={handleUserMessageCopy}
            onUserMessageEdit={handleUserMessageEdit}
            onAssistantCopy={handleAssistantCopy}
            onAssistantRegenerate={handleAssistantRegenerate}
            networkUnreachableTip={null}
          />
        </View>

        <KeyboardStickyView
          offset={{ closed: 0, opened: 0 }}
          style={{ backgroundColor: canvasBg }}
        >
          <ClarifyPrompt
            prompt={chat.clarifyPrompt}
            submitting={chat.clarifySubmitting}
            submitError={chat.clarifySubmitError}
            onSubmit={(answer) => void chat.submitClarifyAnswer(answer)}
            onSkip={() => void chat.skipClarifyAnswer()}
          />
          {isEmptyChat ? (
            <ChatEmptyShortcutsBar disabled={composerDisabled} onPressGoal={handleGoalShortcutPress} />
          ) : null}
          <ChatComposer
            disabled={composerDisabled}
            streaming={chat.streaming}
            onSend={chat.send}
            keyboardVisible={keyboardVisible}
            onSendVoice={(payload) => void chat.sendVoice(payload)}
            onAbort={chat.abort}
            placeholder={m.chat.inputPlaceholder}
            suggestionDraft={composerSuggestion}
            onConsumeSuggestionDraft={() => setComposerSuggestion(undefined)}
            onAddPendingFollowUp={(text, atts) => chat.followUp.addPendingFollowUp(text, atts)}
            pendingFollowUps={chat.followUp.pendingFollowUps}
            editingFollowUpId={chat.followUp.editingFollowUpId}
            onBeginEditFollowUp={chat.followUp.beginEditFollowUp}
            onCancelEditFollowUp={chat.followUp.cancelEditFollowUp}
            onCommitEditFollowUp={chat.followUp.commitEditFollowUp}
            onPendingFollowUpRemove={chat.followUp.removePendingFollowUp}
            onPendingFollowUpMove={chat.followUp.movePendingFollowUp}
            onPendingFollowUpSteer={(id) => void chat.followUp.steerPendingFollowUp(id)}
            steeringFollowUpId={chat.followUp.steeringFollowUpId}
            onQueueFull={() => chat.setSnackMsg(t(m.chat.followUpQueueMaxReached, { max: MAX_PENDING_FOLLOW_UPS }))}
          />
          {!keyboardVisible ? (
            <Text style={[styles.aiDisclaimer, { color: pillMuted, paddingBottom: Math.max(10, insets.bottom) }]}>
              {m.chat.aiDisclaimer}
            </Text>
          ) : null}
        </KeyboardStickyView>
      </View>

      <Snackbar visible={Boolean(chat.snackMsg)} onDismiss={() => chat.setSnackMsg('')} duration={2500}>
        {chat.snackMsg}
      </Snackbar>

      <Snackbar
        key={routeSwitchToast?.key ?? 'none'}
        visible={Boolean(routeSwitchToast)}
        onDismiss={() => { /* hook auto-clears */ }}
        duration={3500}
      >
        {routeSwitchToast?.message ?? ''}
      </Snackbar>

      <RouteOverrideToastView
        toast={routeOverrideToast}
        onDismiss={() => { /* hook auto-clears */ }}
      />

      {pickerSheets}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chatBody: { flex: 1, minHeight: 0 },
  bootstrapRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  listFill: { flex: 1, minHeight: 0 },
  aiDisclaimer: {
    fontSize: 11, textAlign: 'center', paddingBottom: 10, paddingHorizontal: 16,
  },
});