import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useGatewayStore } from '../../stores/gateway-store';
import { syncGatewayUrlsFromTunnelQr } from './apply-tunnel-qr-from-api';
import { SettingsSection, useSettingsColors } from '../settings/settings-ui';
import {
  useGatewayConnectionKindLabel,
  useGatewayConnectionView,
} from './use-gateway-connection-view';

type GatewayConnectionCardProps = {
  gatewayReachable?: boolean | null;
  onSyncNotice?: (message: string) => void;
};

function ConnectionRow({
  label,
  value,
  muted,
  isLast,
}: {
  label: string;
  value: string;
  muted?: boolean;
  isLast?: boolean;
}) {
  const colors = useSettingsColors();
  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[styles.rowValue, { color: muted ? colors.textMuted : colors.text }]}
        selectable
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function GatewayConnectionCard({ gatewayReachable, onSyncNotice }: GatewayConnectionCardProps) {
  const g = useMessages().gateway;
  const colors = useSettingsColors();
  const view = useGatewayConnectionView();
  const kindLabel = useGatewayConnectionKindLabel(view, g);
  const refreshActiveBaseUrl = useGatewayStore((s) => s.refreshActiveBaseUrl);
  const [rechecking, setRechecking] = useState(false);
  const [refreshingLan, setRefreshingLan] = useState(false);

  const handleRecheck = useCallback(async () => {
    setRechecking(true);
    try {
      await refreshActiveBaseUrl();
    } finally {
      setRechecking(false);
    }
  }, [refreshActiveBaseUrl]);

  const handleRefreshLan = useCallback(async () => {
    setRefreshingLan(true);
    try {
      const result = await syncGatewayUrlsFromTunnelQr();
      if (result.updated) {
        onSyncNotice?.(g.refreshLanOk);
      } else {
        onSyncNotice?.(g.refreshLanFailed);
      }
    } finally {
      setRefreshingLan(false);
    }
  }, [g.refreshLanFailed, g.refreshLanOk, onSyncNotice]);

  if (view.connectionKind === 'unconfigured') {
    return null;
  }

  const lanDisplay = view.lanHost ?? g.lanNotConfigured;
  const showUnreachable = gatewayReachable === false;

  return (
    <SettingsSection title={g.connectionStatusTitle} style={styles.section}>
      <View
        style={[
          styles.kindBanner,
          { borderBottomColor: colors.border },
        ]}
      >
        <Text variant="labelLarge" style={{ color: colors.text }}>
          {g.connectionCurrent}: {kindLabel}
        </Text>
        {view.activeHost ? (
          <Text variant="bodySmall" style={{ color: colors.textMuted, marginTop: 4 }}>
            {g.connectionActiveUrl}: {view.activeHost}
          </Text>
        ) : null}
        {showUnreachable ? (
          <Text variant="bodySmall" style={{ color: '#FF3B30', marginTop: 4 }}>
            {g.gatewayUnreachable}
          </Text>
        ) : null}
        <View style={styles.actionRow}>
          <Button
            mode="text"
            compact
            loading={rechecking}
            disabled={rechecking || refreshingLan}
            onPress={() => void handleRecheck()}
          >
            {g.recheckConnection}
          </Button>
          <Button
            mode="text"
            compact
            loading={refreshingLan}
            disabled={refreshingLan || rechecking}
            onPress={() => void handleRefreshLan()}
          >
            {g.refreshLanAddress}
          </Button>
        </View>
      </View>
      <ConnectionRow label={g.lanAddress} value={lanDisplay} muted={!view.lanHost} />
      <ConnectionRow label={g.tunnelAddress} value={view.tunnelHost} isLast />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  kindBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginTop: 4,
    marginLeft: -8,
    gap: 4,
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 15,
    lineHeight: 20,
  },
});
