/**
 * High-performance message list using @shopify/flash-list.
 * Supports inverted layout (newest at bottom), streaming append,
 * and scroll-to-bottom behavior.
 *
 * On session switch the entire FlashList is re-mounted (via React key)
 * so the scroll position resets cleanly — no visible "scroll down" flash.
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

import { useKeyboardListPadding } from '../../hooks/use-keyboard-list-padding';
import { MessageBubble } from './MessageBubble';
import type { Message, ProgressState } from './messages.types';

const LIST_BASE_PADDING_BOTTOM = 8;

/** Generate a stable key for each message row. */
function messageKey(msg: Message, index: number): string {
  if (msg.timestamp) return `${msg.role}-${msg.timestamp}-${index}`;
  return `${msg.role}-${index}`;
}

export const MessageList = memo(function MessageList({
  messages,
  streaming,
  progress,
  loading,
  sessionKey,
  welcomeTitle,
  welcomeSubtitle,
  suggestions,
  onSuggestionPress,
}: {
  messages: Message[];
  streaming: boolean;
  progress: ProgressState | null;
  loading: boolean;
  /** Pass the current session key so we can reset scroll state on session switch. */
  sessionKey?: string;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  suggestions?: string[];
  onSuggestionPress?: (text: string) => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const keyboardPadding = useKeyboardListPadding();
  const listRef = useRef<FlashListRef<Message>>(null);
  const isAtBottomRef = useRef(true);
  const prevLengthRef = useRef(messages.length);

  /**
   * Monotonically increasing counter bumped on every sessionKey change.
   * Used as the React `key` of FlashList so it fully re-mounts,
   * which avoids the visible "scroll from top to bottom" flash on web.
   */
  const prevSessionKeyRef = useRef(sessionKey);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    if (sessionKey !== prevSessionKeyRef.current) {
      prevSessionKeyRef.current = sessionKey;
      prevLengthRef.current = 0;
      isAtBottomRef.current = true;
      // Bump key → FlashList unmounts/remounts with fresh scroll position
      setListKey((k) => k + 1);
    }
  }, [sessionKey]);

  // Auto-scroll when new messages arrive or during streaming
  useEffect(() => {
    if (messages.length === 0) return;
    const lengthChanged = messages.length !== prevLengthRef.current;
    prevLengthRef.current = messages.length;

    if (isAtBottomRef.current || lengthChanged || streaming) {
      // Use double-rAF to ensure FlashList has laid out the new content before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: false });
        });
      });
    }
  }, [messages, streaming]);

  useEffect(() => {
    if (keyboardPadding <= 0 || messages.length === 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    });
  }, [keyboardPadding, messages.length]);

  const listContentStyle = useMemo(
    () => ({
      paddingTop: 12,
      paddingBottom: LIST_BASE_PADDING_BOTTOM + keyboardPadding,
    }),
    [keyboardPadding],
  );

  const emptyContentStyle = useMemo(
    () => [
      styles.emptyContent,
      { paddingBottom: 32 + keyboardPadding },
    ],
    [keyboardPadding],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isLast = index === messages.length - 1;
      const isStreamRow = streaming && isLast && item.role === 'assistant';
      return (
        <MessageBubble
          message={item}
          isStreaming={isStreamRow}
          progress={isStreamRow ? progress : null}
          sessionKey={sessionKey}
        />
      );
    },
    [messages.length, streaming, progress, sessionKey],
  );

  const keyExtractor = useCallback(
    (item: Message, index: number) => messageKey(item, index),
    [],
  );

  const onScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
      isAtBottomRef.current = distanceFromBottom < 60;
    },
    [],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (messages.length === 0 && !streaming) {
    const chips = suggestions?.filter(Boolean) ?? [];
    return (
      <ScrollView
        style={styles.listFlex}
        contentContainerStyle={emptyContentStyle}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.botAvatar}>
          <View style={styles.botEyeRow}>
            <View style={styles.botEye} />
            <View style={styles.botEye} />
          </View>
        </View>
        <Text variant="titleMedium" style={styles.emptyTitle}>
          {welcomeTitle ?? 'Start a conversation'}
        </Text>
        <Text variant="bodySmall" style={styles.emptySubtitle}>
          {welcomeSubtitle ?? 'Type a message below to begin chatting with your AI assistant.'}
        </Text>
        {chips.length > 0 ? (
          <View style={styles.chipColumn}>
            {chips.map((label) => (
              <Pressable
                key={label}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    borderColor: isDark ? 'rgba(180,180,190,0.35)' : 'rgba(120,120,128,0.35)',
                    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                  },
                  pressed && { opacity: 0.88, backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7' },
                ]}
                onPress={() => onSuggestionPress?.(label)}
              >
                <Text variant="bodySmall" style={[styles.chipText, { color: isDark ? '#E5E5EA' : '#1C1C1E' }]} numberOfLines={2}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <FlashList
      key={listKey}
      ref={listRef}
      style={styles.listFlex}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={listContentStyle}
      onMomentumScrollEnd={onScrollEnd}
      onScrollEndDrag={onScrollEnd}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    />
  );
});

const styles = StyleSheet.create({
  listFlex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 28,
    gap: 10,
  },
  botAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  botEyeRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  botEye: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: {
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    opacity: 0.58,
    maxWidth: 280,
    lineHeight: 20,
  },
  chipColumn: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 14,
    maxWidth: 340,
    width: '100%',
  },
  chip: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chipText: {
    textAlign: 'left',
    lineHeight: 20,
  },
});
