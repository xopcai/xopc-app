import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { ActivityIndicator, Appbar, Chip, Icon, Snackbar, Text } from 'react-native-paper';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { NoteCard } from './NoteCard';
import { flushPendingNotes, queueNote } from './notes-sync';

type StatusFilter = 'all' | NoteStatus;
type KindFilter = 'all' | NoteKind;

export function NotesScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const configured = useGatewayConfigured();
  const m = useMessages();
  const pm = m.notesPage;
  const insets = useSafeAreaInsets();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef<ExpoRecording | null>(null);

  const notesQuery = useQuery({
    queryKey: [...queryKeys.notes, statusFilter, kindFilter],
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes });
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

  const handleAction = useCallback(
    async (note: NoteIndexEntry, action: 'pin' | 'unpin' | 'archive' | 'delete') => {
      try {
        if (action === 'pin') await updateNote(note.id, { pinned: true });
        else if (action === 'unpin') await updateNote(note.id, { pinned: false });
        else if (action === 'archive') await updateNote(note.id, { status: 'archived' });
        else if (action === 'delete') await deleteNote(note.id);
        await queryClient.invalidateQueries({ queryKey: queryKeys.notes });
        setSnackMsg(action === 'delete' ? pm.deleted : pm.updated);
      } catch (err) {
        setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
      }
    },
    [queryClient, pm],
  );

  const [actionNote, setActionNote] = useState<NoteIndexEntry | null>(null);
  const handleLongPress = useCallback((note: NoteIndexEntry) => setActionNote(note), []);
  const dismissAction = useCallback(() => setActionNote(null), []);

  const onRefresh = useCallback(async () => {
    await flushPendingNotes();
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes });
  }, [queryClient]);

  const notes = notesQuery.data?.items ?? [];

  const pageBg = isDark ? '#000000' : '#F5F5F7';
  const barBg = isDark ? '#000000' : '#FFFFFF';
  const surface = isDark ? '#1C1C1E' : '#F5F5F7';
  const border = isDark ? '#3A3A3C' : '#E5E5EA';
  const textColor = isDark ? '#E5E7EB' : '#1C1C1E';
  const mutedColor = '#8E8E93';
  const accent = '#007AFF';

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
      <NoteCard note={item} isDark={isDark} onPress={handleNotePress} onLongPress={handleLongPress} />
    ),
    [isDark, handleNotePress, handleLongPress],
  );

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: pageBg }]}>
        <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
          <Appbar.BackAction onPress={() => dismissOrHome(router)} />
          <Appbar.Content title={pm.title} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={{ opacity: 0.6 }}>{m.sessions.gatewayNotConfigured}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: pageBg }]}>
      <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
        <Appbar.BackAction onPress={() => dismissOrHome(router)} />
        <Appbar.Content title={pm.title} />
      </Appbar.Header>

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
                <Icon source="note-text-outline" size={48} color={mutedColor} />
                <Text style={{ color: mutedColor, marginTop: 8 }}>{pm.empty}</Text>
                <Text style={{ color: mutedColor, fontSize: 12 }}>{pm.emptyHint}</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Bottom composer — matches ChatComposer shell style */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.composerShell, { backgroundColor: surface, borderColor: border }]}>
            <View style={styles.composerRow}>
              <Pressable style={styles.toolBtn} onPress={() => void handlePickImage('photos')}>
                <Icon source="image-outline" size={20} color={mutedColor} />
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={() => void handlePickImage('camera')}>
                <Icon source="camera-outline" size={20} color={mutedColor} />
              </Pressable>
              <TextInput
                style={[styles.composerInput, { color: textColor }]}
                placeholder={pm.quickCapturePlaceholder}
                placeholderTextColor={mutedColor}
                value={captureText}
                onChangeText={setCaptureText}
                onSubmitEditing={handleCapture}
                returnKeyType="send"
                multiline={false}
              />
              {captureText.trim() ? (
                <Pressable
                  style={[styles.sendCircle, { backgroundColor: '#1C1C1E' }]}
                  onPress={handleCapture}
                  disabled={captureMutation.isPending}
                  hitSlop={8}
                >
                  <Icon source="arrow-up" size={20} color="#FFFFFF" />
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.toolBtn, recording && { backgroundColor: '#EF4444', borderRadius: 18 }]}
                  onPressIn={() => void handleVoiceStart()}
                  onPressOut={() => void handleVoiceEnd()}
                  hitSlop={8}
                >
                  <Icon source="microphone" size={20} color={recording ? '#FFFFFF' : mutedColor} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </KeyboardStickyView>

      {/* Action sheet for long-press */}
      {actionNote && (
        <View style={[styles.actionSheet, { backgroundColor: surface, borderColor: border }]}>
          <Pressable style={styles.actionItem} onPress={() => { void handleAction(actionNote, actionNote.pinned ? 'unpin' : 'pin'); dismissAction(); }}>
            <Icon source={actionNote.pinned ? 'pin-off' : 'pin'} size={20} color={textColor} />
            <Text style={{ color: textColor }}>{actionNote.pinned ? pm.unpin : pm.pin}</Text>
          </Pressable>
          <Pressable style={styles.actionItem} onPress={() => { void handleAction(actionNote, 'archive'); dismissAction(); }}>
            <Icon source="archive" size={20} color={textColor} />
            <Text style={{ color: textColor }}>{pm.archive}</Text>
          </Pressable>
          <Pressable style={styles.actionItem} onPress={() => { void handleAction(actionNote, 'delete'); dismissAction(); }}>
            <Icon source="delete" size={20} color="#EF4444" />
            <Text style={{ color: '#EF4444' }}>{pm.delete}</Text>
          </Pressable>
          <Pressable style={styles.actionItem} onPress={dismissAction}>
            <Text style={{ color: mutedColor }}>{m.common.cancel}</Text>
          </Pressable>
        </View>
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
  empty: { alignItems: 'center', paddingVertical: 48, gap: 4 },
  composerWrap: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
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
  },
  sendCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
