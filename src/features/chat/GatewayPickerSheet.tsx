/**
 * Bottom sheet for quick gateway switching within the chat screen.
 */
import { memo, useCallback } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Icon, Text } from 'react-native-paper';

import { buildGatewayPickerRowSubtitle } from '../gateway/gateway-picker-subtitle';
import { useGatewayConnectionView } from '../gateway/use-gateway-connection-view';
import { useMessages } from '../../i18n/messages';
import type { GatewayProfile } from '../../stores/gateway-types';

export const GatewayPickerSheet = memo(function GatewayPickerSheet({
  visible,
  profiles,
  activeGatewayId,
  gatewayOnline,
  switchingId,
  onSelect,
  onManageSettings,
  onAddGateway,
  onDismiss,
}: {
  visible: boolean;
  profiles: GatewayProfile[];
  activeGatewayId: string | null;
  gatewayOnline: boolean;
  switchingId: string | null;
  onSelect: (profileId: string) => void;
  onManageSettings: () => void;
  onAddGateway: () => void;
  onDismiss: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const c = m.chat;
  const g = m.gateway;
  const connectionView = useGatewayConnectionView();

  const handleSelect = useCallback(
    (profileId: string) => {
      if (switchingId) return;
      onSelect(profileId);
    },
    [onSelect, switchingId],
  );

  const textPrimary = isDark ? '#F5F5F7' : '#1C1C1E';
  const textMuted = isDark ? '#8E8E93' : '#6B7280';
  const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: sheetBg }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text variant="titleSmall" style={[styles.sheetTitle, { color: textPrimary }]}>
            {c.gatewayPickerTitle}
          </Text>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} bounces={false}>
            {profiles.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: textMuted }]}>{c.gatewayPickerEmpty}</Text>
                <Button mode="contained-tonal" onPress={onAddGateway} style={styles.emptyBtn}>
                  {c.gatewayPickerAdd}
                </Button>
              </View>
            ) : (
              profiles.map((profile) => {
                const isActive = profile.id === activeGatewayId;
                const isSwitching = switchingId === profile.id;
                const subtitle = buildGatewayPickerRowSubtitle(
                  profile,
                  isActive,
                  connectionView,
                  gatewayOnline,
                  g,
                  c,
                );

                return (
                  <Pressable
                    key={profile.id}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: isActive
                          ? isDark
                            ? 'rgba(59,130,246,0.15)'
                            : 'rgba(59,130,246,0.08)'
                          : 'transparent',
                      },
                      pressed && !isSwitching && { opacity: 0.7 },
                    ]}
                    onPress={() => handleSelect(profile.id)}
                    disabled={Boolean(switchingId)}
                  >
                    <View style={styles.rowContent}>
                      <Text
                        style={[
                          styles.rowName,
                          { color: isDark ? '#E5E5EA' : '#1C1C1E' },
                          isActive && styles.rowNameActive,
                        ]}
                        numberOfLines={1}
                      >
                        {profile.name}
                      </Text>
                      <Text style={[styles.rowDesc, { color: textMuted }]} numberOfLines={2}>
                        {subtitle}
                      </Text>
                    </View>
                    {isSwitching ? (
                      <ActivityIndicator size={18} />
                    ) : isActive ? (
                      <Icon source="check" size={18} color="#3B82F6" />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button mode="outlined" icon="cog-outline" onPress={onManageSettings}>
              {c.gatewayPickerManage}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  scrollArea: {
    paddingHorizontal: 12,
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowNameActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  rowDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  emptyWrap: {
    paddingHorizontal: 8,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyBtn: {
    alignSelf: 'stretch',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
