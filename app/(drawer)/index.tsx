/**
 * Chat screen — thin render shell.
 * All state + logic lives in `use-chat-page.ts`.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Banner, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposer } from '../../src/features/chat/ChatComposer';
import { ChatStreamNotice } from '../../src/features/chat/ChatStreamNotice';
import { ClarifyPrompt } from '../../src/features/chat/ClarifyPrompt';
import { AgentPickerSheet } from '../../src/features/chat/AgentPickerSheet';
import { ChatHeader } from '../../src/features/chat/ChatHeader';
import { GatewayPickerSheet } from '../../src/features/chat/GatewayPickerSheet';
import { GoalMissionCard } from '../../src/features/chat/GoalMissionCard';
import { MessageList } from '../../src/features/chat/MessageList';
import { GlobalConnectionStatusBar } from '../../src/features/gateway/GlobalConnectionStatusBar';
import { RouteOverrideToastView } from '../../src/features/gateway/RouteOverrideToastView';
import { useChatPage } from '../../src/features/chat/use-chat-page';
import { appendOlderSessionHistoryPage } from '../../src/features/chat/session-message-parser';
import { queryKeys } from '../../src/query/keys';
import { MAX_PENDING_FOLLOW_UPS } from '../../src/features/chat/pending-follow-up.types';
import { t } from '../../src/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const page = useChatPage();
  const {
    sessionKey,
    urlSessionKey,
    isDark,
    colors,
    keyboardVisible,
    m,
    agentsQuery,
    modelsQuery,
    sessionHistoryQuery,
    currentSessionAgentId,
    effectiveModelId,
    agentName,
    modelName,
    displayMessages,
    chatSuggestions,
    isEmptyChat,
    composerDisabled,
    composerSuggestion,
    setComposerSuggestion,
    bootstrap,
    chat,
    gatewayProfiles,
    activeGatewayId,
    gatewayOnline,
    routeSwitchToast,
    routeOverrideToast,
    agentSheetVisible,
    setAgentSheetVisible,
    gatewaySheetVisible,
    setGatewaySheetVisible,
    switchingGatewayId,
    openDrawer,
    openAgentsPicker,
    openReconnectLanding,
    handleModelSelect,
    handleAgentSelect,
    handleNewChat,
    handleStarterSend,
    handleGoalShortcutPress,
    handleUserMessageCopy,
    handleUserMessageEdit,
    handleAssistantCopy,
    handleAssistantRegenerate,
    handleGatewaySelect,
    handleGatewayManageSettings,
    handleGatewayAdd,
  } = page;

  const headerPaddingTop = insets.top + 8;
  const canvasBg = colors.surface.base;

  return (
    <View style={[styles.screen, { backgroundColor: canvasBg }]}>
      <ChatHeader
        agentName={agentName}
        modelName={modelName}
        models={modelsQuery.data?.items ?? []}
        currentModelId={effectiveModelId}
        paddingTop={headerPaddingTop}
        headerBg={isDark ? '#000000' : '#FFFFFF'}
        headerBorder={colors.border.default}
        pillText={colors.text.primary}
        pillMuted={colors.text.tertiary}
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
        {!urlSessionKey && bootstrap.bootstrapError ? (
          <Banner
            visible
            icon="alert"
            actions={[{ label: m.common.retry, onPress: bootstrap.retryBootstrapSession }]}
          >
            {bootstrap.bootstrapError}
          </Banner>
        ) : null}
        {!urlSessionKey && bootstrap.creatingInitialSession ? (
          <View style={styles.bootstrapRow}>
            <ActivityIndicator size="small" />
            <Text variant="bodySmall" style={{ opacity: 0.65 }}>{m.common.loading}</Text>
          </View>
        ) : null}

        <ChatStreamNotice
          isDark={isDark}
          reconnecting={chat.streamReconnecting}
          reconnectingLabel={m.chat.streamReconnecting}
          resumeVisible={!chat.streaming && chat.resumePromptVisible && !chat.streamReconnecting}
          resumeLabel={m.chat.resumeBanner}
          resumeActionLabel={m.chat.resumeButton}
          onResume={() => { void chat.resume({ background: true }); }}
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
            loading={sessionHistoryQuery.isLoading || (!sessionKey && bootstrap.creatingInitialSession)}
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
            onAtBottomChange={(isAtBottom) => { chat.messageListAtBottomRef.current = isAtBottom; }}
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
          style={{ backgroundColor: canvasBg, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <ClarifyPrompt
            prompt={chat.clarifyPrompt}
            submitting={chat.clarifySubmitting}
            submitError={chat.clarifySubmitError}
            onSubmit={(answer) => void chat.submitClarifyAnswer(answer)}
            onSkip={() => void chat.skipClarifyAnswer()}
          />
          <ChatComposer
            sessionKey={sessionKey}
            disabled={composerDisabled}
            streaming={chat.streaming}
            onPressGoalShortcut={isEmptyChat ? handleGoalShortcutPress : undefined}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chatBody: { flex: 1, minHeight: 0 },
  bootstrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listFill: { flex: 1, minHeight: 0 },
});
