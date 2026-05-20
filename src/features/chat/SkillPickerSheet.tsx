/**
 * Bottom sheet to pick an enabled skill and send a /skill: message.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { fetchSkillsCached, type SkillCatalogEntry } from './command-palette-api';

export const SkillPickerSheet = memo(function SkillPickerSheet({
  visible,
  onDismiss,
  onSelect,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (skillName: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const t = m.chat.emptyShortcuts;
  const [skills, setSkills] = useState<SkillCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchSkillsCached()
      .then((list) => {
        if (!cancelled) setSkills(list);
      })
      .catch(() => {
        if (!cancelled) setError(t.skillSheetLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, t.skillSheetLoadFailed]);

  const handleSelect = useCallback(
    (name: string) => {
      onSelect(name);
      onDismiss();
    },
    [onDismiss, onSelect],
  );

  const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? '#F5F5F7' : '#1C1C1E';
  const muted = '#8E8E93';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: sheetBg }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text variant="titleSmall" style={[styles.title, { color: textColor }]}>
            {t.skillSheetTitle}
          </Text>

          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : error ? (
            <Text variant="bodySmall" style={{ color: '#EF4444', textAlign: 'center' }}>
              {error}
            </Text>
          ) : skills.length === 0 ? (
            <Text variant="bodySmall" style={{ color: muted, textAlign: 'center', paddingVertical: 16 }}>
              {t.skillSheetEmpty}
            </Text>
          ) : (
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} bounces={false}>
              {skills.map((skill) => (
                <Pressable
                  key={skill.name}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  onPress={() => handleSelect(skill.name)}
                >
                  <View style={styles.rowContent}>
                    <Text variant="bodyLarge" style={{ color: textColor, fontWeight: '500' }}>
                      {skill.name}
                    </Text>
                    {skill.description ? (
                      <Text variant="bodySmall" style={{ color: muted }} numberOfLines={2}>
                        {skill.description}
                      </Text>
                    ) : null}
                  </View>
                  <Icon source="chevron-right" size={20} color={muted} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.45)',
    marginBottom: 8,
  },
  title: {
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  loader: {
    paddingVertical: 24,
  },
  scrollArea: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
});
