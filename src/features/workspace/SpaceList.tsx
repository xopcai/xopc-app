import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type View as RNView } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Icon, Text } from 'react-native-paper';

import { sessionDisplayName } from '../../lib/session-helpers';
import type { SessionListItem } from '../../query/sessions';
import { useMessages } from '../../i18n/messages';
import { useTheme } from '../../theme';

import { useOptionalWorkspaceTransition } from './workspace-transition-context';

interface SpaceListProps {
  sessions: SessionListItem[];
  onSessionPress: (sessionKey: string) => void;
  onViewAll: () => void;
  onAskAi: () => void;
  onAskAiPressIn?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SpaceList({ sessions, onSessionPress, onViewAll, onAskAi, onAskAiPressIn }: SpaceListProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const hm = m.homePage;
  const accent = colors.accent.primary;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{hm.sectionChats}</Text>
        <Pressable onPress={onViewAll}>
          <Text style={[styles.openText, { color: accent }]}>{hm.chatViewAll}</Text>
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface.panel }]}>
        <AskAiRow onPress={onAskAi} onPressIn={onAskAiPressIn} />
        {sessions.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{hm.noChats}</Text>
          </View>
        ) : (
          sessions.map((session) => (
            <Pressable key={session.key} style={styles.itemRow} onPress={() => onSessionPress(session.key)}>
              <View style={[styles.iconBubble, { backgroundColor: colors.accent.selectionBg }]}>
                <Icon source="message-processing-outline" size={16} color={accent} />
              </View>
              <View style={styles.itemCopy}>
                <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text.primary }]}>{sessionDisplayName(session)}</Text>
              </View>
              <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

function AskAiRow({ onPress, onPressIn }: { onPress: () => void; onPressIn?: () => void }) {
  const { colors } = useTheme();
  const m = useMessages();
  const hm = m.homePage;
  const accent = colors.accent.primary;
  const transition = useOptionalWorkspaceTransition();
  const rowRef = useRef<RNView>(null);

  const measureRow = useCallback(async () => {
    return new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      rowRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      });
    });
  }, []);

  useEffect(() => {
    if (!transition) return;
    transition.registerPillMeasurer(measureRow);
    return () => transition.registerPillMeasurer(null);
  }, [measureRow, transition]);

  const hiddenStyle = useAnimatedStyle(() => {
    if (!transition) return { opacity: 1 };
    return { opacity: transition.progress.value < 0.04 ? 1 : 0 };
  }, [transition]);

  return (
    <View ref={rowRef} collapsable={false}>
      <AnimatedPressable
        style={[styles.itemRow, styles.actionRow, hiddenStyle]}
        onPress={onPress}
        onPressIn={onPressIn}
        accessibilityRole="button"
        accessibilityLabel={hm.askAi}
      >
        <View style={[styles.iconBubble, styles.actionIconBubble, { backgroundColor: colors.accent.selectionBg }]}>
          <Icon source="creation-outline" size={16} color={accent} />
        </View>
        <View style={styles.itemCopy}>
          <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text.primary }]}>{hm.askAi}</Text>
          <Text numberOfLines={1} style={[styles.itemSubtitle, { color: colors.text.tertiary }]}>{hm.askAiHint}</Text>
        </View>
        <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  openText: { fontSize: 13, fontWeight: '600' },
  card: { borderRadius: 20, overflow: 'hidden' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  emptyText: { flex: 1, fontSize: 13, fontWeight: '500' },
  itemRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  actionRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionIconBubble: {},
  itemCopy: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '600' },
  itemSubtitle: { fontSize: 12, fontWeight: '400' },
});
