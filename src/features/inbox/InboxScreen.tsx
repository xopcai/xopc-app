import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { fetchNotes, quickCaptureNote, updateNote, type NoteIndexEntry } from '../../query/notes';
import { queryKeys } from '../../query/keys';
import { useTheme } from '../../theme';

export function InboxScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');

  const inboxQuery = useQuery({
    queryKey: queryKeys.notes('inbox'),
    queryFn: () => fetchNotes({ status: 'inbox', limit: 100 }),
  });

  const captureMutation = useMutation({
    mutationFn: (text: string) => quickCaptureNote(text),
    onSuccess: async () => {
      setCaptureText('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : '保存失败'),
  });

  const archiveMutation = useMutation({
    mutationFn: (noteId: string) => updateNote(noteId, { status: 'archived' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : '归档失败'),
  });

  const handleCapture = useCallback(() => {
    const text = captureText.trim();
    if (!text) return;
    captureMutation.mutate(text);
  }, [captureMutation, captureText]);

  const handleItemPress = useCallback((item: NoteIndexEntry) => {
    router.push(`/items/${item.id}`);
  }, [router]);

  const renderItem = useCallback(({ item }: { item: NoteIndexEntry }) => (
    <Pressable
      style={[styles.itemCard, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}
      onPress={() => handleItemPress(item)}
    >
      <View style={styles.itemIcon}>
        <Icon source="tray-full" size={18} color="#6D5DFB" />
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
            <Icon source="inbox-check-outline" size={42} color={colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Inbox 已清空</Text>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>新想法会先进入这里，再由你整理归类。</Text>
          </View>
        }
      />

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          value={captureText}
          onChangeText={setCaptureText}
          placeholder="快速记录一条想法..."
          placeholderTextColor={colors.text.tertiary}
          style={[styles.captureInput, { color: colors.text.primary, backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)' }]}
          returnKeyType="send"
          onSubmitEditing={handleCapture}
        />
        <Pressable style={styles.captureButton} onPress={handleCapture}>
          <Icon source="send" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <Snackbar visible={!!snackMsg} onDismiss={() => setSnackMsg('')} duration={2200}>{snackMsg}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  captureInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  captureButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D5DFB',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
