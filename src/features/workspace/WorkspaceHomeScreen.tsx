import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppToast } from '../../components/AppToast';
import { FloatingHeader } from '../../components/FloatingHeader';
import { TOAST_BOTTOM_LIFT_ABOVE_BAR, TOAST_DURATION_SHORT } from '../../constants/toast';
import { openChat, openNoteDetail } from '../../lib/navigation';
import { useMessages, t } from '../../i18n/messages';

import { queryKeys } from '../../query/keys';
import {
  fetchHome,
  type HomeCronJob,
  type HomeCronRun,
  type HomeData,
  type HomeGateway,
  type HomeWorkflowRun,
} from '../../query/home';
import { captureNote, fetchNotes, type NoteIndexEntry } from '../../query/notes';
import { invalidateHomeFeed, invalidateSessionLists } from '../../query/workspace-sync';
import { resolveNoteListTitle } from '../notes/note-title';
import { readLocalNote } from '../notes/notes-local';
import { createSession, type SessionListItem, useGatewayConfigured } from '../../query/sessions';
import { fetchChatAgents, type ChatAgentOption, useEffectiveDefaultAgentId } from '../../query/agents';
import { useGatewayStore } from '../../stores/gateway-store';
import {
  FLOATING_BOTTOM_OFFSET,
  floatingBottomPadding,
  radii,
  spacing,
  typography,
  useTheme,
} from '../../theme';
import { sessionDisplayName } from '../../lib/session-helpers';

import { AttachmentFileError, pickAttachmentFromSource, type AttachmentPickSource } from '../chat/attachment-file-io';
import type { ComposerAttachment } from '../chat/composer.types';
import {
  captureNoteWithComposerAttachment,
  captureNoteWithVoice,
  prepareVoiceCapturePayload,
} from '../notes/capture-note-media';
import { parseCaptureIntent } from '../notes/capture-parser';
import { queueMediaCapture, queueNote } from '../notes/notes-sync';
import { QuickCaptureComposer } from '../notes/QuickCaptureComposer';
import { WorkspaceSearchOverlay } from '../search/WorkspaceSearchOverlay';
import { AgentAvatar } from '../ai/AgentAvatar';
import { readAgentUsage, touchAgentUsage } from '../ai/agent-usage-cache';
import { useHomeChatPrefetch } from './use-home-chat-prefetch';
import { useWorkspaceNavigation } from './workspace-navigation-context';

type ContinueItem =
  | { id: string; kind: 'session'; title: string; meta: string; icon: string; onPress: () => void }
  | { id: string; kind: 'note'; title: string; meta: string; icon: string; onPress: () => void }
  | { id: string; kind: 'workflow'; title: string; meta: string; icon: string; onPress: () => void };

type CapturePayload =
  | { type: 'text'; text: string }
  | { type: 'attachment'; attachment: ComposerAttachment }
  | { type: 'voice'; uri: string; durationMillis: number; mimeType: string };

function iconForNoteKind(kind: NoteIndexEntry['kind']): string {
  if (kind === 'task') return 'checkbox-marked-circle-outline';
  if (kind === 'voice') return 'microphone-outline';
  if (kind === 'media') return 'image-outline';
  if (kind === 'bookmark') return 'bookmark-outline';
  return 'note-text-outline';
}

function timeLabel(value: string | number | undefined, hm: ReturnType<typeof useMessages>['homePage']): string {
  if (!value) return hm.recentlyUpdated;
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return hm.recentlyUpdated;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return hm.justNow;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return t(hm.minutesAgo, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(hm.hoursAgo, { n: hours });
  const days = Math.floor(hours / 24);
  return t(hm.daysAgo, { n: days });
}

function workflowProgress(run: HomeWorkflowRun, hm: ReturnType<typeof useMessages>['homePage']): string {
  const total = run.metrics.agentCount;
  if (total <= 0) return hm.workflowRunning;
  return t(hm.workflowProgress, { done: run.metrics.doneAgentCount, total });
}

function cronTitle(job: HomeCronJob | HomeCronRun, fallback: string): string {
  const name = 'jobId' in job ? job.jobName : job.name;
  return name?.trim() || fallback;
}

function fallbackHomeData(agentId: string): Pick<HomeData, 'activeAgent' | 'gateway' | 'workflowRuns' | 'nextCronJobs' | 'recentCronRuns'> {
  return {
    activeAgent: { id: agentId },
    gateway: {
      status: 'unknown',
      ready: false,
      httpListening: false,
      version: '',
      uptime: 0,
      tunnel: { state: 'disconnected', publicUrl: null, connected: false },
    },
    workflowRuns: { active: [], attention: [], recent: [] },
    nextCronJobs: [],
    recentCronRuns: [],
  };
}

export function WorkspaceHomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const configured = useGatewayConfigured();
  const activeGatewayId = useGatewayStore((s) => s.activeGatewayId);
  const defaultAgentId = useEffectiveDefaultAgentId();
  const { openAskAi, prefetchAskAiSession } = useWorkspaceNavigation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [agentUsage, setAgentUsage] = useState(() => readAgentUsage(activeGatewayId));

  useHomeChatPrefetch(configured);

  useEffect(() => {
    setAgentUsage(readAgentUsage(activeGatewayId));
  }, [activeGatewayId]);

  const homeQuery = useQuery({
    queryKey: queryKeys.home,
    queryFn: fetchHome,
    enabled: configured,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: configured,
  });

  const home = homeQuery.data;
  const recentlyOpened = home?.recentlyOpened ?? [];
  const needsRecentNotesFallback = configured && !homeQuery.isLoading && recentlyOpened.length === 0;

  const recentNotesFallbackQuery = useQuery({
    queryKey: [...queryKeys.notesAll, 'home-preview'] as const,
    queryFn: () =>
      fetchNotes({
        limit: 5,
        offset: 0,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    enabled: needsRecentNotesFallback,
    staleTime: 60_000,
  });

  const homeNotes = useMemo(() => {
    if (recentlyOpened.length > 0) return recentlyOpened.slice(0, 4);
    return recentNotesFallbackQuery.data?.items.slice(0, 4) ?? [];
  }, [recentNotesFallbackQuery.data?.items, recentlyOpened]);

  const homeNotesLoading =
    homeQuery.isLoading || (needsRecentNotesFallback && recentNotesFallbackQuery.isLoading);

  const homeAgents = useMemo(() => {
    const agents = agentsQuery.data?.items ?? [];
    return [...agents].sort((a, b) => {
      const aUsed = agentUsage[a.id] ?? 0;
      const bUsed = agentUsage[b.id] ?? 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return (a.name ?? a.id).localeCompare(b.name ?? b.id);
    });
  }, [agentUsage, agentsQuery.data?.items]);

  const m = useMessages();
  const hm = m.homePage;
  const pm = m.notesPage;
  const im = m.inboxPage;
  const cm = m.chat;
  const homeDefaults = useMemo(() => fallbackHomeData(defaultAgentId), [defaultAgentId]);

  const handleNotePress = useCallback((item: NoteIndexEntry) => {
    openNoteDetail(router, item.id);
  }, [router]);

  const handleSessionPress = useCallback((sessionKey: string) => {
    router.push(`/chat/${sessionKey}`);
  }, [router]);

  const handleRefresh = useCallback(() => {
    void homeQuery.refetch().then((result) => {
      const opened = result.data?.recentlyOpened ?? [];
      if (opened.length === 0) {
        void recentNotesFallbackQuery.refetch();
      }
      prefetchAskAiSession();
    });
  }, [homeQuery, recentNotesFallbackQuery, prefetchAskAiSession]);

  const invalidateCaptureTargets = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
    invalidateHomeFeed(queryClient);
  }, [queryClient]);

  const captureMutation = useMutation({
    mutationFn: async (payload: CapturePayload) => {
      if (payload.type === 'text') {
        const intent = parseCaptureIntent(payload.text);
        return captureNote({ text: payload.text, kind: intent.kind });
      }
      if (payload.type === 'attachment') {
        return captureNoteWithComposerAttachment(payload.attachment, captureText);
      }
      return captureNoteWithVoice(payload);
    },
    onSuccess: () => {
      setCaptureText('');
      setCaptureOpen(false);
      setToastMessage(hm.captureSaved);
      invalidateCaptureTargets();
    },
    onError: async (err, payload) => {
      try {
        if (payload.type === 'text') {
          queueNote(payload.text);
        } else if (payload.type === 'attachment') {
          queueMediaCapture({ type: 'attachment', attachment: payload.attachment, text: captureText });
        } else {
          const queued = await prepareVoiceCapturePayload(payload);
          queueMediaCapture({ type: 'voice', ...queued });
        }
        setCaptureText('');
        setCaptureOpen(false);
        setToastMessage(pm.savedOffline);
        invalidateCaptureTargets();
      } catch {
        setToastMessage(err instanceof Error ? err.message : pm.actionFailed);
      }
    },
  });

  const createAgentSessionMutation = useMutation({
    mutationFn: (agentId: string) => createSession(agentId),
    onSuccess: (key) => {
      invalidateSessionLists(queryClient);
      openChat(router, key);
    },
    onError: (err) => {
      setToastMessage(err instanceof Error ? err.message : hm.noAgentChatFailed);
    },
  });

  const openCapture = useCallback(() => {
    setCaptureOpen(true);
  }, []);

  const closeCapture = useCallback(() => {
    if (captureMutation.isPending) return;
    setCaptureOpen(false);
  }, [captureMutation.isPending]);

  const handleCaptureSubmit = useCallback(() => {
    const text = captureText.trim();
    if (!text) return;
    captureMutation.mutate({ type: 'text', text });
  }, [captureMutation, captureText]);

  const handleAttachmentSource = useCallback(async (source: AttachmentPickSource) => {
    try {
      const attachment = await pickAttachmentFromSource(source);
      if (!attachment) return;
      captureMutation.mutate({ type: 'attachment', attachment });
    } catch (error) {
      if (error instanceof AttachmentFileError && error.code === 'permission_denied') {
        setToastMessage(source === 'camera' ? cm.attachmentCameraPermissionDenied : cm.attachmentPermissionDenied);
        return;
      }
      setToastMessage(pm.actionFailed);
    }
  }, [captureMutation, cm.attachmentCameraPermissionDenied, cm.attachmentPermissionDenied, pm.actionFailed]);

  const handleVoiceCapture = useCallback((payload: { uri: string; durationMillis: number; mimeType: string }) => {
    captureMutation.mutate({ type: 'voice', ...payload });
  }, [captureMutation]);

  const continueItems = useMemo<ContinueItem[]>(() => {
    const activeWorkflows = (home?.workflowRuns.active ?? []).slice(0, 2).map((run) => ({
      id: `workflow:${run.id}`,
      kind: 'workflow' as const,
      title: run.title,
      meta: `${hm.workflowItemMeta} · ${workflowProgress(run, hm)}`,
      icon: 'source-branch-sync',
      onPress: () => {
        if (run.sessionKey) handleSessionPress(run.sessionKey);
        else router.push('/automation');
      },
    }));
    const sessions = (home?.recentSessions ?? []).slice(0, 2).map((session) => ({
      id: `session:${session.key}`,
      kind: 'session' as const,
      title: sessionDisplayName(session, m.sessions.untitled),
      meta: `${hm.chatItemMeta} · ${timeLabel(session.updatedAt, hm)}`,
      icon: 'message-processing-outline',
      onPress: () => handleSessionPress(session.key),
    }));
    const notes = homeNotes.slice(0, 3).map((note) => ({
      id: `note:${note.id}`,
      kind: 'note' as const,
      title: resolveNoteListTitle(note, hm.untitled, readLocalNote(note.id)),
      meta: `${hm.noteItemMeta} · ${timeLabel(note.lastOpenedAt ?? note.updatedAt, hm)}`,
      icon: iconForNoteKind(note.kind),
      onPress: () => handleNotePress(note),
    }));
    return [...activeWorkflows, ...sessions, ...notes].slice(0, 5);
  }, [handleNotePress, handleSessionPress, hm, home?.recentSessions, home?.workflowRuns.active, homeNotes, m.sessions.untitled, router]);

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
        <FloatingHeader
          showLogo
          title="xopc"
          rightIcon="cog-outline"
          onRightPress={() => router.push('/settings')}
        />
        <View style={styles.centerContent}>
          <Icon source="cloud-off-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{hm.connectGatewayTitle}</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{hm.connectGatewayHint}</Text>
        </View>
        <BottomCommandBar
          searchLabel={hm.commandSearch}
          askLabel={hm.askAi}
          captureLabel={hm.commandCapture}
          onSearch={() => setSearchOpen(true)}
          onAskAi={openAskAi}
          onAskAiPressIn={prefetchAskAiSession}
          onCapture={openCapture}
          captureActive={captureOpen || captureMutation.isPending}
        />
        <HomeCaptureSheet
          visible={captureOpen}
          title={hm.captureTitle}
          closeLabel={hm.captureClose}
          value={captureText}
          onChangeText={setCaptureText}
          onSubmit={handleCaptureSubmit}
          onVoiceCapture={handleVoiceCapture}
          onAttachmentSource={(source) => void handleAttachmentSource(source)}
          onDismiss={closeCapture}
          placeholder={im.capturePlaceholder}
          submitting={captureMutation.isPending}
        />
        <WorkspaceSearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
        <AppToast
          visible={!!toastMessage}
          onDismiss={() => setToastMessage('')}
          duration={TOAST_DURATION_SHORT}
          bottomLift={TOAST_BOTTOM_LIFT_ABOVE_BAR}
        >
          {toastMessage}
        </AppToast>
      </View>
    );
  }

  const refreshing = homeQuery.isFetching && !homeQuery.isLoading;
  const pendingTasks = home?.pendingTasks ?? [];
  const recentSessions = home?.recentSessions ?? [];
  const inboxCount = home?.inboxCount ?? 0;
  const pendingTaskCount = home?.pendingTaskCount ?? 0;
  const gateway = home?.gateway ?? homeDefaults.gateway;
  const activeWorkflow = home?.workflowRuns.active[0];
  const attentionWorkflow = home?.workflowRuns.attention[0];
  const nextCronJob = home?.nextCronJobs[0];
  const recentCronRun = home?.recentCronRuns[0];
  const showEmptyContinue = !homeQuery.isLoading && !homeNotesLoading && continueItems.length === 0;
  const nextTask = pendingTasks[0];

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader
        showLogo
        title="xopc"
        rightIcon="cog-outline"
        onRightPress={() => router.push('/settings')}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: floatingBottomPadding(insets.bottom) + FLOATING_BOTTOM_OFFSET + 80 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {homeQuery.isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <HomeGatewayStatus gateway={gateway} />
            <ContinueSection
              items={continueItems}
              loading={homeNotesLoading}
              empty={showEmptyContinue}
              onViewSessions={() => router.push('/sessions')}
            />
            <AttentionSection
              inboxCount={inboxCount}
              pendingTaskCount={pendingTaskCount}
              workflowAttentionCount={home?.workflowRuns.attention.length ?? 0}
              nextTask={nextTask}
              attentionWorkflow={attentionWorkflow}
              onInboxPress={() => router.push('/inbox')}
              onTasksPress={() => router.push('/notes?kind=task')}
              onTaskPress={(note) => handleNotePress(note)}
              onWorkflowPress={(run) => {
                if (run.sessionKey) handleSessionPress(run.sessionKey);
                else router.push('/automation');
              }}
            />
            <ActivitySection
              activeWorkflow={activeWorkflow}
              attentionWorkflow={attentionWorkflow}
              nextCronJob={nextCronJob}
              recentCronRun={recentCronRun}
              recentSession={recentSessions[0]}
              captureActive={captureOpen || captureMutation.isPending}
              onAskAi={openAskAi}
              onAskAiPressIn={prefetchAskAiSession}
              onCapture={openCapture}
              onAutomation={() => router.push('/automation')}
            />
            <AgentStrip
              agents={homeAgents}
              loading={agentsQuery.isLoading}
              busyAgentId={
                createAgentSessionMutation.isPending
                  ? createAgentSessionMutation.variables
                  : undefined
              }
              onAgentPress={(agentId) => {
                setAgentUsage(touchAgentUsage(activeGatewayId, agentId));
                createAgentSessionMutation.mutate(agentId);
              }}
            />
            <LibrarySection
              onNotes={() => router.push('/notes')}
              onSessions={() => router.push('/sessions')}
              onFiles={() => router.push('/files')}
              onAutomation={() => router.push('/automation')}
              onAgents={() => router.push('/ai/agents')}
            />
          </>
        )}
      </ScrollView>

      <BottomCommandBar
        searchLabel={hm.commandSearch}
        askLabel={hm.askAi}
        captureLabel={hm.commandCapture}
        onSearch={() => setSearchOpen(true)}
        onAskAi={openAskAi}
        onAskAiPressIn={prefetchAskAiSession}
        onCapture={openCapture}
        captureActive={captureOpen || captureMutation.isPending}
      />
      <HomeCaptureSheet
        visible={captureOpen}
        title={hm.captureTitle}
        closeLabel={hm.captureClose}
        value={captureText}
        onChangeText={setCaptureText}
        onSubmit={handleCaptureSubmit}
        onVoiceCapture={handleVoiceCapture}
        onAttachmentSource={(source) => void handleAttachmentSource(source)}
        onDismiss={closeCapture}
        placeholder={im.capturePlaceholder}
        submitting={captureMutation.isPending}
      />
      <WorkspaceSearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
      <AppToast
        visible={!!toastMessage}
        onDismiss={() => setToastMessage('')}
        duration={TOAST_DURATION_SHORT}
        bottomLift={TOAST_BOTTOM_LIFT_ABOVE_BAR}
      >
        {toastMessage}
      </AppToast>
    </View>
  );
}

function HomeGatewayStatus({ gateway }: { gateway: HomeGateway }) {
  const { colors } = useTheme();
  const m = useMessages();
  const hm = m.homePage;
  if (gateway.ready) return null;
  return (
    <View style={[styles.statusBanner, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
      <Icon source="progress-clock" size={16} color={colors.semantic.warning} />
      <Text style={[styles.statusText, { color: colors.text.secondary }]}>
        {hm.gatewayStartingStatus}
      </Text>
    </View>
  );
}

function agentName(agent: ChatAgentOption): string {
  return agent.name?.trim() || agent.id;
}

function AgentStrip({
  agents,
  loading,
  busyAgentId,
  onAgentPress,
}: {
  agents: ChatAgentOption[];
  loading: boolean;
  busyAgentId?: string;
  onAgentPress: (agentId: string) => void;
}) {
  const { colors } = useTheme();
  const { homePage: hm } = useMessages();
  const visibleAgents = agents.slice(0, 12);

  if (loading) {
    return (
      <Section title={hm.sectionAgents}>
        <View style={[styles.agentStripLoading, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
          <ActivityIndicator size="small" />
        </View>
      </Section>
    );
  }

  if (visibleAgents.length === 0) return null;

  return (
    <Section title={hm.sectionAgents}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.agentStripContent}
      >
        {visibleAgents.map((agent) => {
          const busy = busyAgentId === agent.id;
          return (
            <Pressable
              key={agent.id}
              style={[
                styles.agentPill,
                { backgroundColor: colors.surface.panel, borderColor: colors.border.default },
                busy && styles.disabled,
              ]}
              onPress={() => onAgentPress(agent.id)}
              disabled={busy}
            >
              {busy ? (
                <View style={styles.agentPillAvatar}>
                  <ActivityIndicator size={20} />
                </View>
              ) : (
                <AgentAvatar agentId={agent.id} avatar={agent.avatar} size={52} />
              )}
              <Text numberOfLines={1} style={[styles.agentPillName, { color: colors.text.primary }]}>
                {agentName(agent)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Section>
  );
}

function ContinueSection({
  items,
  loading,
  empty,
  onViewSessions,
}: {
  items: ContinueItem[];
  loading: boolean;
  empty: boolean;
  onViewSessions: () => void;
}) {
  const { colors } = useTheme();
  const { homePage: hm } = useMessages();

  return (
    <Section title={hm.sectionContinue} actionLabel={hm.viewSessions} onAction={onViewSessions}>
      <View style={[styles.panel, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
        {loading ? (
          <View style={styles.emptyRow}>
            <ActivityIndicator size="small" />
          </View>
        ) : empty ? (
          <View style={styles.emptyRow}>
            <Text style={[styles.emptyInlineText, { color: colors.text.tertiary }]}>{hm.noContinueItems}</Text>
          </View>
        ) : (
          items.map((item, index) => (
            <Pressable key={item.id} style={styles.listRow} onPress={item.onPress}>
              <View style={[styles.iconBubble, { backgroundColor: colors.accent.selectionBg }]}>
                <Icon source={item.icon} size={18} color={colors.accent.primary} />
              </View>
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text.primary }]}>{item.title}</Text>
                <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.text.tertiary }]}>{item.meta}</Text>
              </View>
              <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
              {index < items.length - 1 ? (
                <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />
              ) : null}
            </Pressable>
          ))
        )}
      </View>
    </Section>
  );
}

function AttentionSection({
  inboxCount,
  pendingTaskCount,
  workflowAttentionCount,
  nextTask,
  attentionWorkflow,
  onInboxPress,
  onTasksPress,
  onTaskPress,
  onWorkflowPress,
}: {
  inboxCount: number;
  pendingTaskCount: number;
  workflowAttentionCount: number;
  nextTask?: NoteIndexEntry;
  attentionWorkflow?: HomeWorkflowRun;
  onInboxPress: () => void;
  onTasksPress: () => void;
  onTaskPress: (note: NoteIndexEntry) => void;
  onWorkflowPress: (run: HomeWorkflowRun) => void;
}) {
  const { colors } = useTheme();
  const { homePage: hm } = useMessages();
  const nextTaskTitle = nextTask ? resolveNoteListTitle(nextTask, hm.untitled, readLocalNote(nextTask.id)) : null;

  return (
    <Section title={hm.sectionAttention}>
      <View style={styles.metricsGrid}>
        <MetricTile
          icon="tray-full"
          label={hm.inboxMetric}
          value={inboxCount}
          onPress={onInboxPress}
        />
        <MetricTile
          icon="checkbox-marked-circle-outline"
          label={hm.tasksMetric}
          value={pendingTaskCount}
          onPress={onTasksPress}
        />
        <MetricTile
          icon="alert-circle-outline"
          label={hm.workflowMetric}
          value={workflowAttentionCount}
          onPress={() => attentionWorkflow ? onWorkflowPress(attentionWorkflow) : undefined}
        />
      </View>
      <Pressable
        style={[styles.panelRow, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}
        onPress={attentionWorkflow ? () => onWorkflowPress(attentionWorkflow) : nextTask ? () => onTaskPress(nextTask) : onTasksPress}
      >
        <View style={[styles.iconBubble, { backgroundColor: colors.accent.selectionBg }]}>
          <Icon source={attentionWorkflow ? 'source-branch-sync' : 'flag-outline'} size={18} color={colors.accent.primary} />
        </View>
        <View style={styles.rowCopy}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text.primary }]}>
            {attentionWorkflow?.title ?? nextTaskTitle ?? hm.noNextTask}
          </Text>
          <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.text.tertiary }]}>
            {attentionWorkflow ? hm.workflowNeedsAttention : nextTask ? hm.nextTaskHint : hm.noNextTaskHint}
          </Text>
        </View>
        <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
      </Pressable>
    </Section>
  );
}

function ActivitySection({
  activeWorkflow,
  attentionWorkflow,
  nextCronJob,
  recentCronRun,
  recentSession,
  captureActive,
  onAskAi,
  onAskAiPressIn,
  onCapture,
  onAutomation,
}: {
  activeWorkflow?: HomeWorkflowRun;
  attentionWorkflow?: HomeWorkflowRun;
  nextCronJob?: HomeCronJob;
  recentCronRun?: HomeCronRun;
  recentSession?: SessionListItem;
  captureActive: boolean;
  onAskAi: () => void;
  onAskAiPressIn?: () => void;
  onCapture: () => void;
  onAutomation: () => void;
}) {
  const { colors } = useTheme();
  const m = useMessages();
  const hm = m.homePage;
  const activityTitle =
    activeWorkflow?.title ??
    attentionWorkflow?.title ??
    (nextCronJob ? cronTitle(nextCronJob, hm.automation) : undefined) ??
    (recentCronRun ? cronTitle(recentCronRun, hm.automation) : undefined) ??
    (recentSession ? sessionDisplayName(recentSession, m.sessions.untitled) : hm.noAgentActivity);
  const activitySubtitle =
    activeWorkflow
      ? workflowProgress(activeWorkflow, hm)
      : attentionWorkflow
        ? hm.workflowNeedsAttention
        : nextCronJob
          ? `${hm.nextCronRun} · ${timeLabel(nextCronJob.nextRunAt, hm)}`
          : recentCronRun
            ? `${hm.recentCronRun} · ${timeLabel(recentCronRun.startedAt, hm)}`
            : recentSession
              ? hm.recentAgentActivity
              : hm.noAgentActivityHint;

  return (
    <Section title={hm.sectionActivity}>
      <View style={[styles.panel, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
        <View style={styles.activityIntro}>
          <View style={[styles.iconBubble, { backgroundColor: colors.accent.selectionBg }]}>
            <Icon source="creation-outline" size={18} color={colors.accent.primary} />
          </View>
          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text.primary }]}>{activityTitle}</Text>
            <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.text.tertiary }]}>
              {activitySubtitle}
            </Text>
          </View>
        </View>
        <View style={styles.actionGrid}>
          <ActionButton
            icon="creation-outline"
            label={hm.askAi}
            onPress={onAskAi}
            onPressIn={onAskAiPressIn}
          />
          <ActionButton
            icon={captureActive ? 'progress-pencil' : 'tray-plus'}
            label={hm.commandCapture}
            onPress={onCapture}
            disabled={captureActive}
          />
          <ActionButton
            icon="clock-outline"
            label={hm.automation}
            onPress={onAutomation}
          />
        </View>
      </View>
    </Section>
  );
}

function LibrarySection({
  onNotes,
  onSessions,
  onFiles,
  onAutomation,
  onAgents,
}: {
  onNotes: () => void;
  onSessions: () => void;
  onFiles: () => void;
  onAutomation: () => void;
  onAgents: () => void;
}) {
  const { homePage: hm } = useMessages();
  return (
    <Section title={hm.sectionLibrary}>
      <View style={styles.libraryGrid}>
        <LibraryButton icon="note-text-outline" label={hm.libraryNotes} onPress={onNotes} />
        <LibraryButton icon="message-processing-outline" label={hm.librarySessions} onPress={onSessions} />
        <LibraryButton icon="folder-outline" label={hm.libraryFiles} onPress={onFiles} />
        <LibraryButton icon="clock-outline" label={hm.libraryAutomation} onPress={onAutomation} />
        <LibraryButton icon="account-supervisor-outline" label={hm.libraryAgents} onPress={onAgents} />
      </View>
    </Section>
  );
}

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.headerAction}>
            <Text style={[styles.openText, { color: colors.accent.primary }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function MetricTile({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[styles.metricTile, { backgroundColor: colors.accent.soft, borderColor: colors.border.default }]}
      onPress={onPress}
    >
      <Icon source={icon} size={18} color={colors.accent.primary} />
      <Text style={[styles.metricValue, { color: colors.text.primary }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.text.tertiary }]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  onPressIn,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[styles.actionButton, { backgroundColor: colors.surface.base, borderColor: colors.border.subtle }, disabled && styles.disabled]}
      onPress={onPress}
      onPressIn={onPressIn}
      disabled={disabled}
    >
      <Icon source={icon} size={18} color={colors.accent.primary} />
      <Text numberOfLines={1} style={[styles.actionLabel, { color: colors.text.primary }]}>{label}</Text>
    </Pressable>
  );
}

function LibraryButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[styles.libraryButton, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}
      onPress={onPress}
    >
      <Icon source={icon} size={20} color={colors.accent.primary} />
      <Text numberOfLines={1} style={[styles.libraryLabel, { color: colors.text.primary }]}>{label}</Text>
    </Pressable>
  );
}

function BottomCommandBar({
  searchLabel,
  askLabel,
  captureLabel,
  onSearch,
  onAskAi,
  onAskAiPressIn,
  onCapture,
  captureActive,
}: {
  searchLabel: string;
  askLabel: string;
  captureLabel: string;
  onSearch: () => void;
  onAskAi: () => void;
  onAskAiPressIn?: () => void;
  onCapture: () => void;
  captureActive: boolean;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const shadowOpacity = isDark ? 0.18 : 0.06;
  const itemStyle = [
    styles.commandItem,
    {
      backgroundColor: colors.surface.panel,
      borderColor: colors.border.default,
      shadowOpacity,
    },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.commandBar,
        { paddingBottom: floatingBottomPadding(insets.bottom) + FLOATING_BOTTOM_OFFSET },
      ]}
    >
      <Pressable style={itemStyle} onPress={onSearch} accessibilityLabel={searchLabel}>
        <Icon source="magnify" size={21} color={colors.text.secondary} />
      </Pressable>
      <Pressable
        style={[itemStyle, styles.askCommand]}
        onPress={onAskAi}
        onPressIn={onAskAiPressIn}
        accessibilityLabel={askLabel}
      >
        <Icon source="creation-outline" size={18} color={colors.accent.primary} />
        <Text numberOfLines={1} style={[styles.askCommandText, { color: colors.text.primary }]}>{askLabel}</Text>
      </Pressable>
      <Pressable style={itemStyle} onPress={onCapture} disabled={captureActive} accessibilityLabel={captureLabel}>
        {captureActive ? (
          <ActivityIndicator size={18} color={colors.accent.primary} />
        ) : (
          <Icon source="tray-plus" size={21} color={colors.text.secondary} />
        )}
      </Pressable>
    </View>
  );
}

function HomeCaptureSheet({
  visible,
  title,
  closeLabel,
  value,
  onChangeText,
  onSubmit,
  onVoiceCapture,
  onAttachmentSource,
  onDismiss,
  placeholder,
  submitting,
}: {
  visible: boolean;
  title: string;
  closeLabel: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onVoiceCapture: (payload: { uri: string; durationMillis: number; mimeType: string }) => void;
  onAttachmentSource: (source: AttachmentPickSource) => void;
  onDismiss: () => void;
  placeholder: string;
  submitting: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        style={[styles.captureScrim, { backgroundColor: colors.overlay.scrim }]}
        onPress={onDismiss}
        disabled={submitting}
      />
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.captureSticky}>
        <View
          style={[
            styles.capturePanel,
            {
              backgroundColor: colors.surface.panel,
              borderColor: colors.border.default,
              paddingBottom: floatingBottomPadding(insets.bottom),
            },
          ]}
        >
          <View style={[styles.captureHandle, { backgroundColor: colors.border.default }]} />
          <View style={styles.captureHeader}>
            <Text style={[styles.captureTitle, { color: colors.text.primary }]}>{title}</Text>
            <Pressable
              style={styles.captureClose}
              onPress={onDismiss}
              disabled={submitting}
              accessibilityLabel={closeLabel}
            >
              <Icon source="close" size={20} color={colors.text.secondary} />
            </Pressable>
          </View>
          <QuickCaptureComposer
            value={value}
            onChangeText={onChangeText}
            onSubmit={onSubmit}
            onVoiceCapture={onVoiceCapture}
            onAttachmentSource={onAttachmentSource}
            placeholder={placeholder}
            submitting={submitting}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { ...typography.heading, fontWeight: '600' },
  emptyText: { ...typography.ui, textAlign: 'center' },
  loadingCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  statusBanner: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: { ...typography.caption, fontWeight: '500' },
  section: { gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typography.heading },
  headerAction: { minHeight: 32, justifyContent: 'center' },
  openText: { ...typography.label, fontWeight: '600' },
  agentStripLoading: {
    minHeight: 92,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentStripContent: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  agentPill: {
    width: 86,
    minHeight: 96,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  agentPillAvatar: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentPillName: {
    ...typography.caption,
    maxWidth: '100%',
    fontWeight: '600',
    textAlign: 'center',
  },
  panel: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  panelRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  listRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowDivider: {
    position: 'absolute',
    left: 62,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...typography.ui, fontWeight: '600' },
  rowSubtitle: { ...typography.caption },
  emptyRow: { minHeight: 72, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  emptyInlineText: { ...typography.label, fontWeight: '500', textAlign: 'center' },
  metricsGrid: { flexDirection: 'row', gap: spacing.md },
  metricTile: {
    flex: 1,
    minHeight: 92,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricValue: { fontSize: 24, lineHeight: 30, fontWeight: '600' },
  metricLabel: { ...typography.caption, fontWeight: '500' },
  activityIntro: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  actionLabel: { ...typography.caption, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  libraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  libraryButton: {
    width: '47.9%',
    minHeight: 72,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  libraryLabel: { ...typography.label, fontWeight: '600' },
  commandBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
  },
  commandItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  askCommand: {
    flex: 1,
    width: undefined,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  askCommandText: { ...typography.ui, fontWeight: '600' },
  captureScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  captureSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  capturePanel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  captureHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  captureHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  captureTitle: { ...typography.heading, fontWeight: '600' },
  captureClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
