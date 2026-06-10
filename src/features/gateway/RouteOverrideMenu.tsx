/**
 * Bottom-sheet menu for the manual route override. Long-pressing the drawer
 * pill opens this sheet so power users can pin LAN, pin Cloud, or fall back
 * to auto. We also surface a "test now" action that forces a probe round.
 */
import { memo, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMessages } from '../../i18n/messages';
import { useResolvedIsDark } from '../../lib/stack-screen-theme';
import { useGatewayStore } from '../../stores/gateway-store';

import {
  copyForConnectionState,
  useConnectionState,
} from './connection-state';
import { runProbeRound } from './probe-coordinator';
import type { RouteOverride } from './route-override';

export type RouteOverrideMenuProps = {
  visible: boolean;
  onRequestClose: () => void;
};

export const RouteOverrideMenu = memo(function RouteOverrideMenu({
  visible,
  onRequestClose,
}: RouteOverrideMenuProps) {
  const insets = useSafeAreaInsets();
  const isDark = useResolvedIsDark();
  const m = useMessages();
  const o = m.gateway.routeOverride;

  const lanUrl = useGatewayStore((s) => s.lanUrl);
  const baseUrl = useGatewayStore((s) => s.baseUrl);
  const current = useGatewayStore((s) => s.routeOverride);
  const setOverride = useGatewayStore((s) => s.setRouteOverride);
  const state = useConnectionState();
  const stateCopy = copyForConnectionState(state, m.gateway.state);

  const colors = {
    bg: isDark ? '#1C1C1E' : '#FFFFFF',
    overlay: 'rgba(0,0,0,0.5)',
    text: isDark ? '#F5F5F7' : '#1C1C1E',
    muted: isDark ? '#8E8E93' : '#6D6D70',
    border: isDark ? '#2C2C2E' : '#E5E5EA',
    selected: isDark ? 'rgba(0,122,255,0.18)' : 'rgba(0,122,255,0.10)',
    accent: '#0A84FF',
  };

  const handlePick = useCallback(
    async (next: RouteOverride) => {
      if (next === current) {
        onRequestClose();
        return;
      }
      await setOverride(next);
      onRequestClose();
    },
    [current, onRequestClose, setOverride],
  );

  const handleTest = useCallback(async () => {
    await runProbeRound('manual', { force: true });
    onRequestClose();
  }, [onRequestClose]);

  const lanAvailable = Boolean(lanUrl?.trim());
  const tunnelAvailable = Boolean(baseUrl.trim());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onRequestClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bg,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text variant="titleSmall" style={{ color: colors.text }}>
            {o.title}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.muted, marginTop: 2 }} numberOfLines={2}>
            {stateCopy.long}
          </Text>
        </View>

        <Choice
          icon="auto-fix"
          title={o.auto}
          subtitle={o.autoSubtitle}
          selected={current === 'auto'}
          accent={colors.accent}
          onPress={() => void handlePick('auto')}
          colors={colors}
        />
        <Choice
          icon="lan-connect"
          title={o.lan}
          subtitle={lanAvailable ? o.lanSubtitle : o.lanUnavailable}
          selected={current === 'lan'}
          disabled={!lanAvailable}
          accent={colors.accent}
          onPress={() => void handlePick('lan')}
          colors={colors}
        />
        <Choice
          icon="cloud-check-outline"
          title={o.tunnel}
          subtitle={tunnelAvailable ? o.tunnelSubtitle : o.tunnelUnavailable}
          selected={current === 'tunnel'}
          disabled={!tunnelAvailable}
          accent={colors.accent}
          onPress={() => void handlePick('tunnel')}
          colors={colors}
        />

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable onPress={() => void handleTest()} style={styles.testRow}>
            <Icon source="refresh" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: '500' }}>{o.testNow}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

type ChoiceProps = {
  icon: string;
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  accent: string;
  onPress: () => void;
  colors: {
    text: string;
    muted: string;
    selected: string;
    border: string;
  };
};

function Choice({
  icon,
  title,
  subtitle,
  selected,
  disabled,
  accent,
  onPress,
  colors,
}: ChoiceProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      android_ripple={disabled ? undefined : { color: colors.selected }}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? colors.selected : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.choiceIcon}>
        <Icon source={icon} size={20} color={selected ? accent : colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: selected ? '600' : '500' }}>
          {title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
      </View>
      {selected ? <Icon source="check" size={18} color={accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(142,142,147,0.4)',
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  choiceIcon: {
    width: 22,
    alignItems: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
});
