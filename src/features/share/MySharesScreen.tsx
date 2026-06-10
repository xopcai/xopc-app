/**
 * MySharesScreen — list of every share the user has created on this gateway.
 *
 * Each row offers four actions:
 *   - Preview  (in-app WebView via SharePreviewModal)
 *   - Copy     (share URL → clipboard)
 *   - Extend   (dialog: +1d / +3d / +7d)
 *   - Revoke   (confirm dialog)
 *
 * Hidden complexity:
 *   - Active vs Expired vs Revoked status is derived from `revoked` and
 *     `expired` flags returned by the gateway (see ShareListItem).
 *   - The share `kind` from the server is the storage shape (file vs
 *     directory), NOT the routing kind exposed via /api/shares/auto. We treat
 *     them the same here — both render with the file icon.
 *   - Thumbnails are loaded from `${shareUrl}/thumbnail` (same poller as
 *     ShareSheet uses); placeholder SVG → real jpeg.
 */
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Dialog,
  IconButton,
  Menu,
  Paragraph,
  Portal,
  Text,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';

import { FloatingHeader } from '../../components/FloatingHeader';

import { t, useMessages } from '../../i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../../lib/navigation';
import { useResolvedIsDark } from '../../lib/stack-screen-theme';
import { useGatewayStore } from '../../stores/gateway-store';
import { queryKeys } from '../../query/keys';
import {
  useExtendShare,
  useRevokeShare,
  useShareList,
} from '../../query/shares';
import { useRouter } from 'expo-router';
import type { ShareListItem } from '../../api/share';
import { SharePreviewModal } from './SharePreviewModal';
import { formatRelativeDuration, shareStatus, type ShareStatus } from './share-time';

const EXTEND_OPTIONS_MS = {
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
} as const;

type ExtendPreset = keyof typeof EXTEND_OPTIONS_MS;

export function MySharesScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const isDark = useResolvedIsDark();
  const m = useMessages();
  const pm = m.sharingPage;
  const qc = useQueryClient();
  const list = useShareList();
  const token = useGatewayStore((s) => s.token);

  const [extending, setExtending] = useState<ShareListItem | null>(null);
  const [revoking, setRevoking] = useState<ShareListItem | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<{ url: string; title: string } | null>(null);
  const extend = useExtendShare();
  const revoke = useRevokeShare();

  const bg = isDark ? '#0F172A' : '#F9FAFB';
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDark ? '#38383A' : '#E5E7EB';
  const textColor = isDark ? '#F9FAFB' : '#1F2937';
  const muted = isDark ? '#9CA3AF' : '#6B7280';

  const onRefresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.shares });
  };

  const renderItem = ({ item }: { item: ShareListItem }) => (
    <ShareRow
      item={item}
      token={token}
      isDark={isDark}
      cardBg={cardBg}
      cardBorder={cardBorder}
      textColor={textColor}
      muted={muted}
      menuOpen={menuFor === item.id}
      onMenuOpen={() => setMenuFor(item.id)}
      onMenuClose={() => setMenuFor(null)}
      onPreview={() => setPreviewing({ url: item.shareUrl, title: item.fileName })}
      onExtend={() => setExtending(item)}
      onRevoke={() => setRevoking(item)}
      m={m}
    />
  );

  const empty = (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: textColor }]}>{pm.empty}</Text>
      <Text style={[styles.emptyHint, { color: muted }]}>{pm.emptyHint}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <FloatingHeader title={pm.title} onBack={() => dismissOrHome(router)} />

      {list.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.subtitle, { color: muted }]}>{pm.subtitle}</Text>
          }
          ListEmptyComponent={empty}
          refreshControl={
            <RefreshControl refreshing={list.isFetching && !list.isLoading} onRefresh={onRefresh} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <ExtendDialog
        visible={Boolean(extending)}
        target={extending}
        onDismiss={() => setExtending(null)}
        onPick={async (preset) => {
          if (!extending) return;
          try {
            await extend.mutateAsync({ id: extending.id, extendTtlMs: EXTEND_OPTIONS_MS[preset] });
          } catch {
            /* surfaced through mutation state — keep dialog open if you wanted */
          } finally {
            setExtending(null);
          }
        }}
        m={m}
      />

      <RevokeDialog
        visible={Boolean(revoking)}
        target={revoking}
        loading={revoke.isPending}
        onDismiss={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revoke.mutateAsync(revoking.id);
          } catch {
            /* mutation error surfaces via list refresh */
          } finally {
            setRevoking(null);
          }
        }}
        m={m}
      />

      <SharePreviewModal
        visible={Boolean(previewing)}
        url={previewing?.url ?? null}
        title={previewing?.title ?? null}
        onClose={() => setPreviewing(null)}
      />
    </View>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function ShareRow({
  item,
  token,
  isDark,
  cardBg,
  cardBorder,
  textColor,
  muted,
  menuOpen,
  onMenuOpen,
  onMenuClose,
  onPreview,
  onExtend,
  onRevoke,
  m,
}: {
  item: ShareListItem;
  token: string;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  muted: string;
  menuOpen: boolean;
  onMenuOpen: () => void;
  onMenuClose: () => void;
  onPreview: () => void;
  onExtend: () => void;
  onRevoke: () => void;
  m: ReturnType<typeof useMessages>;
}) {
  const pm = m.sharingPage;
  const status = shareStatus(item);
  const expiryLabel = useMemo(() => formatExpiryLabel(item, pm), [item, pm]);
  const downloads = item.downloadCount;
  const thumbnailUri = `${item.shareUrl.replace(/\/+$/, '')}/thumbnail`;
  const thumbHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(item.shareUrl);
    onMenuClose();
  };

  const handleSystemShare = async () => {
    try {
      await Share.share({ message: `${item.fileName}\n${item.shareUrl}`, url: item.shareUrl, title: item.fileName });
    } catch {
      /* user cancelled */
    } finally {
      onMenuClose();
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <Pressable style={styles.cardLeft} onPress={onPreview} accessibilityRole="button" accessibilityLabel={pm.actionPreview}>
        <View style={[styles.thumb, { backgroundColor: isDark ? '#27272A' : '#F3F4F6' }]}>
          <Image source={{ uri: thumbnailUri, headers: thumbHeaders }} style={styles.thumbImage} resizeMode="cover" />
        </View>
      </Pressable>

      <View style={styles.cardMain}>
        <Text style={[styles.fileName, { color: textColor }]} numberOfLines={1}>
          {item.fileName}
        </Text>
        <Text style={[styles.urlLine, { color: muted }]} numberOfLines={1}>
          {item.shareUrl}
        </Text>
        <View style={styles.metaRow}>
          <StatusChip status={status} m={m} />
          <Text style={[styles.metaText, { color: muted }]} numberOfLines={1}>
            {expiryLabel}
            {downloads > 0 ? ` · ${t(pm.downloadsLabel, { count: downloads })}` : ''}
          </Text>
        </View>
      </View>

      <Menu
        visible={menuOpen}
        onDismiss={onMenuClose}
        anchor={
          <IconButton icon="dots-vertical" size={20} onPress={onMenuOpen} accessibilityLabel="more" />
        }
      >
        <Menu.Item leadingIcon="eye-outline" onPress={() => { onMenuClose(); onPreview(); }} title={pm.actionPreview} />
        <Menu.Item leadingIcon="content-copy" onPress={handleCopy} title={pm.actionCopy} />
        <Menu.Item leadingIcon="share-variant" onPress={handleSystemShare} title={pm.actionShare} />
        <Menu.Item
          leadingIcon="clock-plus-outline"
          onPress={() => { onMenuClose(); onExtend(); }}
          title={pm.actionExtend}
          disabled={item.revoked}
        />
        <Menu.Item
          leadingIcon="link-off"
          onPress={() => { onMenuClose(); onRevoke(); }}
          title={pm.actionRevoke}
          disabled={item.revoked}
        />
      </Menu>
    </View>
  );
}

function StatusChip({ status, m }: { status: ShareStatus; m: ReturnType<typeof useMessages> }) {
  const pm = m.sharingPage;
  const palette: Record<ShareStatus, { bg: string; fg: string; label: string }> = {
    active: { bg: 'rgba(34,197,94,0.12)', fg: '#16A34A', label: pm.statusActive },
    expired: { bg: 'rgba(245,158,11,0.12)', fg: '#D97706', label: pm.statusExpired },
    revoked: { bg: 'rgba(239,68,68,0.12)', fg: '#DC2626', label: pm.statusRevoked },
  };
  const v = palette[status];
  return (
    <View style={[styles.chip, { backgroundColor: v.bg }]}>
      <Text style={[styles.chipText, { color: v.fg }]}>{v.label}</Text>
    </View>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

function ExtendDialog({
  visible,
  target,
  onDismiss,
  onPick,
  m,
}: {
  visible: boolean;
  target: ShareListItem | null;
  onDismiss: () => void;
  onPick: (preset: ExtendPreset) => void;
  m: ReturnType<typeof useMessages>;
}) {
  const pm = m.sharingPage;
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{pm.extendDialogTitle}</Dialog.Title>
        <Dialog.Content>
          <Paragraph>{pm.extendDialogBody}</Paragraph>
          {target ? (
            <Text style={{ marginTop: 8, opacity: 0.7 }} numberOfLines={1}>
              {target.fileName}
            </Text>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => onPick('1d')}>{pm.extend1d}</Button>
          <Button onPress={() => onPick('3d')}>{pm.extend3d}</Button>
          <Button onPress={() => onPick('7d')} mode="contained">{pm.extend7d}</Button>
        </Dialog.Actions>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{m.common.cancel}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function RevokeDialog({
  visible,
  target,
  loading,
  onDismiss,
  onConfirm,
  m,
}: {
  visible: boolean;
  target: ShareListItem | null;
  loading: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  m: ReturnType<typeof useMessages>;
}) {
  const pm = m.sharingPage;
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{pm.revokeDialogTitle}</Dialog.Title>
        <Dialog.Content>
          <Paragraph>{pm.revokeDialogBody}</Paragraph>
          {target ? (
            <Text style={{ marginTop: 8, opacity: 0.7 }} numberOfLines={1}>
              {target.fileName}
            </Text>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading}>{m.common.cancel}</Button>
          <Button onPress={onConfirm} loading={loading} disabled={loading} textColor="#EF4444">
            {pm.actionRevoke}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatExpiryLabel(item: ShareListItem, pm: ReturnType<typeof useMessages>['sharingPage']): string {
  const deltaMs = new Date(item.expiresAt).getTime() - Date.now();
  const formatted = formatRelativeDuration(deltaMs, pm);
  const tpl = deltaMs >= 0 ? pm.expiresIn : pm.expiredAgo;
  // Replace {{when}} directly to avoid pulling in `t` here (keeps this function pure).
  return tpl.replace('{{when}}', formatted);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, paddingBottom: 40, gap: 0 },
  separator: { height: 10 },
  subtitle: { fontSize: 13, marginBottom: 12 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardLeft: {},
  cardMain: { flex: 1, gap: 4, minWidth: 0 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  fileName: { fontSize: 14, fontWeight: '600' },
  urlLine: { fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 11, flexShrink: 1 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
