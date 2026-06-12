import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { pickAttachmentFromSource } from '../chat/attachment-file-io';
import {
  beginRecording,
  finishRecording,
  requestMicPermission,
  type ExpoRecording,
} from '../chat/voiceRecording';
import { fetchNotes, quickCaptureNote, updateNote, type NoteIndexEntry } from '../../query/notes';
import { queryKeys } from '../../query/keys';
import { invalidateHomeFeed } from '../../query/workspace-sync';
import { useTheme, FLOATING_BOTTOM_OFFSET, floatingBottomPadding } from '../../theme';

export function InboxScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef<ExpoRecording | null>(null);

  const inboxQuery = useQuery({
    queryKey: queryKeys.notes('inbox'),
    queryFn: () => fetchNotes({ status: 'inbox', limit: 100 }),
  });

  const captureMutation = useMutation({
    mutationFn: (text: string) => quickCaptureNote(text),
    onSuccess: async () => {
      setCaptureText('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
      invalidateHomeFeed(queryClient);
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : '保存失败'),
  });

  const archiveMutation = useMutation({
    mutationFn: (noteId: string) => updateNote(noteId, { status: 'archived' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
      invalidateHomeFeed(queryClient);
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : '归档失败'),
  });

  const handleCapture = useCallback(() => {
    const text = captureText.trim();
    if (!text) return;
    captureMutation.mutate(text);
  }, [captureMutation, captureText]);

  const handlePickImage = useCallback(async (source: 'camera' | 'photos') => {
    try {
      const attachment = await pickAttachmentFromSource(source);
      if (!attachment) return;
      captureMutation.mutate(`[image: ${attachment.name}]`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('permission')) {
        setSnackMsg('需要相册或相机权限');
        return;
      }
      setSnackMsg('图片记录失败');
    }
  }, [captureMutation]);

  const handleVoiceStart = useCallback(async () => {
    const granted = await requestMicPermission();
    if (!granted) {
      setSnackMsg('需要麦克风权限');
      return;
    }
    setRecording(true);
    try {
      recordingRef.current = await beginRecording(() => {});
    } catch {
      setRecording(false);
      setSnackMsg('语音录制失败');
    }
  }, []);

  const handleVoiceEnd = useCallback(async () => {
    setRecording(false);
    const recordingSession = recordingRef.current;
    if (!recordingSession) return;
    recordingRef.current = null;
    try {
      const { uri, durationMillis } = await finishRecording(recordingSession);
      if (!uri || durationMillis < 500) return;
      captureMutation.mutate(`[voice memo: ${Math.round(durationMillis / 1000)}s]`);
    } catch {
      setSnackMsg('语音记录失败');
    }
  }, [captureMutation]);

  const handleItemPress = useCallback((item: NoteIndexEntry) => {
    router.push(`/items/${item.id}`);
  }, [router]);

  const renderItem = useCallback(({ item }: { item: NoteIndexEntry }) => (
    <Pressable
      style={[styles.itemCard, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}
      onPress={() => handleItemPress(item)}
    >
      <View style={styles.itemIcon}>
        <Icon source="lightbulb-outline" size={20} color="#6D5DFB" />
      </View>
      <View style={styles.itemCopy}>
        <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text.primary }]}>{item.snippet || '无标题'}</Text>
        {!!item.snippet && <Text numberOfLines={2} style={[styles.itemSummary, { color: colors.text.tertiary }]}>{item.snippet}</Text>}
      </View>
      <Pressable style={styles.archiveButton} onPress={() => archiveMutation.mutate(item.id)}>
        <Icon source="archive-outline" size={18} color={colors.text.tertiary} />
      </Pressable>
    </Pressable>
  ), [archiveMutation, colors.text.primary, colors.text.tertiary, handleItemPress, isDark]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
      <FloatingHeader title="Inbox" onBack={() => router.back()} />

      <FlatList
        data={inboxQuery.data?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={inboxQuery.isFetching} onRefresh={() => void inboxQuery.refetch()} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Icon source="tray" size={42} color={colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Inbox 已清空</Text>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>新想法会先进入这里，再由你整理归类。</Text>
          </View>
        }
      />

      <KeyboardStickyView
        offset={{ closed: 0, opened: 0 }}
        style={{ marginBottom: FLOATING_BOTTOM_OFFSET }}
      >
        <View style={[styles.bottomBar, { paddingBottom: floatingBottomPadding(insets.bottom) }]}> 
          <View
            style={[
              styles.captureShell,
              {
                backgroundColor: isDark ? colors.surface.input : colors.surface.panel,
                borderColor: colors.border.default,
              },
            ]}
          >
            <Pressable style={[styles.toolButton, { backgroundColor: colors.surface.input }]} onPress={() => void handlePickImage('photos')}>
              <Icon source="image-outline" size={20} color={colors.text.tertiary} />
            </Pressable>
            <Pressable style={[styles.toolButton, { backgroundColor: colors.surface.input }]} onPress={() => void handlePickImage('camera')}>
              <Icon source="camera-outline" size={20} color={colors.text.tertiary} />
            </Pressable>
            <TextInput
              value={captureText}
              onChangeText={setCaptureText}
              placeholder="快速记录一条想法..."
              placeholderTextColor={colors.text.tertiary}
              style={[styles.captureInput, { color: colors.text.primary }]}
              returnKeyType="send"
              onSubmitEditing={handleCapture}
              multiline
              blurOnSubmit
              textAlignVertical="center"
            />
            {captureText.trim() ? (
              <Pressable
                style={[styles.sendButton, { backgroundColor: colors.text.primary }]}
                onPress={handleCapture}
                disabled={captureMutation.isPending}
                hitSlop={8}
              >
                <Icon source="arrow-up" size={20} color={colors.text.inverse} />
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.toolButton,
                  { backgroundColor: colors.surface.input },
                  recording && styles.recordingButton,
                ]}
                onPressIn={() => void handleVoiceStart()}
                onPressOut={() => void handleVoiceEnd()}
                hitSlop={8}
              >
                <Icon source="microphone" size={20} color={recording ? '#FFFFFF' : colors.text.tertiary} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardStickyView>

      <Snackbar visible={!!snackMsg} onDismiss={() => setSnackMsg('')} duration={2200}>{snackMsg}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bottomBar: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  captureShell: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  toolButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInput: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingButton: {
    backgroundColor: '#EF4444',
  },
  listContent: { padding: 16, gap: 10 },
  itemCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(109,93,251,0.14)' },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 15, fontWeight: '600' },
  itemSummary: { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  archiveButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 36, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
