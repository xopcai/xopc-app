import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useResolvedIsDark } from '../../lib/stack-screen-theme';

export function useSettingsColors() {
  const isDark = useResolvedIsDark();
  return {
    pageBg: isDark ? '#000000' : '#F5F7FA',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    text: isDark ? '#F5F5F7' : '#1C1C1E',
    textMuted: isDark ? '#8E8E93' : '#8E8E93',
    border: isDark ? '#38383A' : '#E5E5EA',
    accent: '#007AFF',
    sectionLabel: isDark ? '#8E8E93' : '#8E8E93',
  };
}

type SettingsSectionProps = {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
};

export function SettingsSection({ title, children, style }: SettingsSectionProps) {
  const colors = useSettingsColors();
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.sectionLabel }]}>{title}</Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  icon: string;
  iconColor?: string;
  label: string;
  value?: string;
  showChevron?: boolean;
  isLast?: boolean;
  onPress?: () => void;
};

export function SettingsRow({
  icon,
  iconColor = '#007AFF',
  label,
  value,
  showChevron = true,
  onPress,
}: SettingsRowProps) {
  const colors = useSettingsColors();
  const content = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}18` }]}>
        <Icon source={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <Icon source="chevron-right" size={20} color={colors.textMuted} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.rowPressed}>
      {content}
    </Pressable>
  );
}

type SettingsOptionRowProps = {
  label: string;
  description?: string;
  selected?: boolean;
  isLast?: boolean;
  onPress: () => void;
};

export function SettingsOptionRow({
  label,
  description,
  selected,
  onPress,
}: SettingsOptionRowProps) {
  const colors = useSettingsColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
        {description ? (
          <Text style={[styles.optionDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon source="check" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

type SettingsAgentRowProps = {
  name: string;
  agentId: string;
  description?: string;
  selected?: boolean;
  isLast?: boolean;
  chatLoading?: boolean;
  onSelect: () => void;
  onChat: () => void;
};

export function SettingsAgentRow({
  name,
  agentId,
  description,
  selected,
  chatLoading,
  onSelect,
  onChat,
}: SettingsAgentRowProps) {
  const colors = useSettingsColors();
  return (
    <View style={styles.agentRow}>
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [styles.agentRowMain, pressed && styles.rowPressed]}
      >
        <View style={[styles.iconWrap, { backgroundColor: '#007AFF18' }]}>
          <Icon source="robot-outline" size={18} color={colors.accent} />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionLabel, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.optionDescription, { color: colors.textMuted }]} numberOfLines={1}>
            {description || agentId}
          </Text>
        </View>
        {selected ? <Icon source="check-circle" size={22} color={colors.accent} /> : null}
      </Pressable>
      <Pressable
        onPress={onChat}
        disabled={chatLoading}
        style={({ pressed }) => [styles.agentChatBtn, pressed && styles.rowPressed]}
        hitSlop={8}
      >
        <Icon source="chat-outline" size={22} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.65,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: 15,
    maxWidth: '42%',
    textAlign: 'right',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionLabel: {
    fontSize: 16,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  agentRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingVertical: 12,
    gap: 12,
    minWidth: 0,
  },
  agentChatBtn: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
