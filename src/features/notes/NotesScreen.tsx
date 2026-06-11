import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ActivityIndicator, Chip, Icon, Snackbar, Text } from 'react-native-paper';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { pickAttachmentFromSource } from '../chat/attachment-file-io';
import {
  beginRecording,
  discardRecording,
  finishRecording,
  inferRecordingMimeType,
  requestMicPermission,
  type ExpoRecording,
} from '../chat/voiceRecording';
import { useMessages } from '../../i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../../lib/navigation';
import {
  deleteNote,
  fetchNotes,
  quickCaptureNote,
  updateNote,
  type NoteIndexEntry,
  type NoteKind,
  type NoteStatus,
} from '../../query/notes';
import { queryKeys } from '../../query/keys';
import { useGatewayConfigured } from '../../query/sessions';
import { useTheme } from '../../theme';

import { NoteCard } from './NoteCard';
import { SwipeableNoteCard, type SwipeAction } from './SwipeableNoteCard';
import { flushPendingNotes, queueNote } from './notes-sync';
import { captureIntentBadgeKey, parseCaptureIntent } from './capture-parser';

type StatusFilter = 'all' | NoteStatus;
type KindFilter = 'all' | NoteKind;

export function NotesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const pm = m.notesPage;
  const insets = useSafeAreaInsets();

  const initialKind = (params.kind as KindFilter) || 'all';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>(initialKind);
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef<ExpoRecording | null>(null);

  const notesQuery = useQuery({
    queryKey: [...queryKeys.notesAll, statusFilter, kindFilter],
    queryFn: () =>
      fetchNotes({
        status: statusFilter === 'all' ? undefined : statusFilter,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        limit: 100,
      }),
    enabled: configured,
  });

  const captureMutation = useMutation({
    mutationFn: (text: string) => quickCaptureNote(text),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notesAll });
    },
    onError: (_err, text) => {
      queueNote(text);
      setSnackMsg(pm.savedOffline);
    },
  });

  const handleCapture = useCallback(() => {
    const text = captureText.trim();
    if (!text) return;
    setCaptureText('');
    captureMutation.mutate(text);
  }, [captureText, captureMutation]);

  const handleVoiceStart = useCallback(async () => {
    const granted = await requestMicPermission();
    if (!granted) { setSnackMsg(pm.micDenied); return; }
    setRecording(true);
    try {
      recordingRef.current = await beginRecording(() => {});
    } catch {
      setRecording(false);
      setSnackMsg(pm.actionFailed);
    }
  }, [pm]);

  const handleVoiceEnd = useCallback(async () => {
    setRecording(false);
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    try {
      const { uri, durationMillis } = await finishRecording(rec);
      if (!uri || durationMillis < 500) { return; }
      const mimeType = inferRecordingMimeType(uri);
      captureMutation.mutate(`[voice memo: ${Math.round(durationMillis / 1000)}s]`);
    } catch {
      setSnackMsg(pm.actionFailed);
    }
  }, [captureMutation, pm]);

  const handleVoiceCancel = useCallback(async () => {
    setRecording(false);
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    await discardRecording(rec);
  }, []);

  const handlePickImage = useCallback(async (source: 'camera' | 'photos') => {
    try {
      const attachment = await pickAttachmentFromSource(source);
      if (!attachment) return;
      captureMutation.mutate(`[image: ${attachment.name}]`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('permission')) {
        setSnackMsg(pm.micDenied);
      }
    }
  }, [captureMutation, pm]);

  const handleNotePress = useCallback((note: NoteIndexEntry) => {
    router.push(`/notes/${note.id}`);
  }, [router]);

  const handleSwipeAction = useCallback(
    async (note: NoteIndexEntry, action: SwipeAction) => {
      try {
        if (action === 'pin') await updateNote(note.id, { pinned: true });
        else if (action === 'unpin') await updateNote(note.id, { pinned: false });
        else if (action === 'archive') await updateNote(note.id, { status: 'archived' });
        else if (action === 'delete') await deleteNote(note.id);
        await queryClient.invalidateQueries({ queryKey: queryKeys.notesAll });
        setSnackMsg(action === 'delete' ? pm.deleted : pm.updated);
      } catch (err) {
        setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
      }
    },
    [queryClient, pm],
  );

  const handleAction = useCallback(
    async (note: NoteIndexEntry, action: 'pin' | 'unpin' | 'archive' | 'delete') => {
      void handleSwipeAction(note, action);
    },
    [handleSwipeAction],
  );

  const [actionNote, setActionNote] = useState<NoteIndexEntry | null>(null);
  const handleLongPress = useCallback((note: NoteIndexEntry) => setActionNote(note), []);
  const dismissAction = useCallback(() => setActionNote(null), []);

  const onRefresh = useCallback(async () => {
    await flushPendingNotes();
    await queryClient.invalidateQueries({ queryKey: queryKeys.notesAll });
  }, [queryClient]);

  const notes = notesQuery.data?.items ?? [];

  const statusFilters: { key: StatusFilter; label: string }[] = useMemo(() => [
    { key: 'all', label: pm.filterAll },
    { key: 'inbox', label: pm.filterInbox },
    { key: 'processed', label: pm.filterProcessed },
    { key: 'archived', label: pm.filterArchived },
  ], [pm]);

  const kindFilters: { key: KindFilter; label: string }[] = useMemo(() => [
    { key: 'all', label: pm.kindAll },
    { key: 'thought', label: pm.kindThought },
    { key: 'todo', label: pm.kindTodo },
    { key: 'voice', label: pm.kindVoice },
    { key: 'media', label: pm.kindMedia },
  ], [pm]);

  const renderNote = useCallback(
    ({ item }: { item: NoteIndexEntry }) => (
      <SwipeableNoteCard note={item} isDark={isDark} onAction={handleSwipeAction}>
        <NoteCard note={item} onPress={handleNotePress} onLongPress={handleLongPress} />
      </SwipeableNoteCard>
    ),
    [isDark, handleNotePress, handleLongPress, handleSwipeAction],
  );

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
        <FloatingHeader title={pm.title} onBack={() => dismissOrHome(router)} />
        <View style={styles.center}>
          <Text style={{ opacity: 0.6 }}>{m.sessions.gatewayNotConfigured}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader title={pm.title} onBack={() => dismissOrHome(router)} />

      {/* Filters — single row, horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterStrip}
      >
        {statusFilters.map((f) => (
          <Chip key={f.key} selected={statusFilter === f.key} onPress={() => setStatusFilter(f.key)} compact mode="outlined">
            {f.label}
          </Chip>
        ))}
        {kindFilters.map((f) => (
          <Chip key={f.key} selected={kindFilter === f.key} onPress={() => setKindFilter(f.key)} compact mode="outlined">
            {f.label}
          </Chip>
        ))}
      </ScrollView>

      {/* List */}
      <View style={styles.listArea}>
        {notesQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={notes}
            keyExtractor={(item) => item.id}
            renderItem={renderNote}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={notesQuery.isFetching && !notesQuery.isLoading} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={[styles.emptyIconWrap, { backgroundColor: colors.accent.selectionBg }]}>
                  <Icon source="note-text-outline" size={40} color={colors.accent.primary} />
                </View>
                <Text style={{ color: colors.text.secondary, marginTop: 12, fontSize: 16, fontWeight: '600' }}>{pm.empty}</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 13, textAlign: 'center', maxWidth: 240 }}>{pm.emptyHint}</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Bottom composer — multiline with smart intent detection */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Intent badge */}
          {captureText.trim().length > 0 && (() => {
            const intent = parseCaptureIntent(captureText);
            const badgeKey = captureIntentBadgeKey(intent);
            if (!badgeKey) return null;
            return (
              <View style={[styles.intentBadge, { backgroundColor: colors.accent.selectionBg, borderColor: colors.border.subtle }]}>
                <Icon source={intent.kind === 'todo' ? 'checkbox-marked-outline' : 'link'} size={14} color={colors.accent.primary} />
                <Text style={{ fontSize: 11, color: colors.accent.primary }}>
                  {pm[badgeKey]}
                </Text>
              </View>
            );
          })()}
          <View style={[styles.composerShell, { backgroundColor: colors.surface.input, borderColor: colors.border.default }]}>
            <View style={styles.composerRow}>
              <Pressable style={styles.toolBtn} onPress={() => void handlePickImage('photos')}>
                <Icon source="image-outline" size={20} color={colors.text.tertiary} />
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={() => void handlePickImage('camera')}>
                <Icon source="camera-outline" size={20} color={colors.text.tertiary} />
              </Pressable>
              <TextInput
                style={[styles.composerInput, { color: colors.text.primary }]}
                placeholder={pm.quickCapturePlaceholder}
                placeholderTextColor={colors.text.tertiary}
                value={captureText}
                onChangeText={setCaptureText}
                onSubmitEditing={handleCapture}
                returnKeyType="send"
                multiline
                blurOnSubmit
                textAlignVertical="center"
              />
              {captureText.trim() ? (
                <Pressable
                  style={[styles.sendCircle, { backgroundColor: colors.text.primary }]}
                  onPress={handleCapture}
                  disabled={captureMutation.isPending}
                  hitSlop={8}
                >
                  <Icon source="arrow-up" size={20} color={colors.text.inverse} />
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.toolBtn, recording && styles.recordingBtn]}
                  onPressIn={() => void handleVoiceStart()}
                  onPressOut={() => void handleVoiceEnd()}
                  hitSlop={8}
                >
                  <Icon source="microphone" size={20} color={recording ? '#FFFFFF' : colors.text.tertiary} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </KeyboardStickyView>

      {/* Action sheet for long-press */}
      {actionNote && (
        <Pressable style={styles.actionBackdrop} onPress={dismissAction}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
            <Pressable style={styles.actionItem} onPress={() => { void handleAction(actionNote, actionNote.pinned ? 'unpin' : 'pin'); dismissAction(); }}>
              <Icon source={actionNote.pinned ? 'pin-off' : 'pin'} size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{actionNote.pinned ? pm.unpin : pm.pin}</Text>
            </Pressable>
            <Pressable style={styles.actionItem} onPress={() => { void handleAction(actionNote, 'archive'); dismissAction(); }}>
              <Icon source="archive" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.archive}</Text>
            </Pressable>
            <Pressable style={styles.actionItem} onPress={() => { void handleAction(actionNote, 'delete'); dismissAction(); }}>
              <Icon source="delete" size={20} color={colors.semantic.error} />
              <Text style={{ color: colors.semantic.error }}>{pm.delete}</Text>
            </Pressable>
            <Pressable style={styles.actionItem} onPress={dismissAction}>
              <Text style={{ color: colors.text.tertiary }}>{m.common.cancel}</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      <Snackbar visible={Boolean(snackMsg)} onDismiss={() => setSnackMsg('')} duration={2500}>
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  filterStrip: {
    flexGrow: 0,
    marginBottom: 6,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },
  listArea: { flex: 1, minHeight: 0 },
  list: { padding: 16, paddingTop: 8, gap: 10, flexGrow: 1 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerWrap: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 4,
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 6,
  },
  composerShell: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: Platform.select({ ios: 5, android: 4, default: 4 }),
    borderWidth: 0,
    maxHeight: 100,
  },
  sendCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 18,
  },
  actionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
});
