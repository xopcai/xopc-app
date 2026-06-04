/**
 * ShareSheet — bottom-sheet modal that takes a workspace file path, calls
 * `POST /api/shares/auto`, and surfaces:
 *
 *  - The generated link's auto-rendered thumbnail (with live readiness poll).
 *  - The share URL + reachability chip (so the user knows whether a friend
 *    can actually open it).
 *  - Two primary actions: Copy link, System share (opens iOS/Android sheet
 *    where WeChat appears as one of the targets).
 *
 * Triggering: caller controls `visible` + `request`. The sheet auto-creates
 * the share the first time it becomes visible for a given request — caller
 * does NOT need to fire the mutation themselves.
 */
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t, useMessages } from '../../i18n/messages';
import { useCreateShare, useThumbnailReadiness, thumbnailUrlWithCacheBust } from '../../query/shares';
import type {
  ShareAutoPayload,
  ShareAutoRequest,
  ShareReachability,
} from '../../api/share';
import { SharePreviewModal } from './SharePreviewModal';

export type ShareSheetProps = {
  visible: boolean;
  request: ShareAutoRequest | null;
  onClose: () => void;
};

export const ShareSheet = memo(function ShareSheet({ visible, request, onClose }: ShareSheetProps) {
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const m = useMessages();

  const { mutate, data, error, isPending, reset } = useCreateShare();

  // Fire-once trigger when the sheet becomes visible for a given request.
  const requestKey = useMemo(() => (request ? JSON.stringify(request) : ''), [request]);
  useEffect(() => {
    if (!visible) return;
    if (!request) return;
    reset();
    mutate(request);
    // Key on requestKey (stringified) rather than request identity so re-renders
    // with structurally equal requests don't re-fire the share creation.
  }, [visible, requestKey, request, mutate, reset]);

  const { status: thumbStatus } = useThumbnailReadiness(
    data?.thumbnail.url,
    data?.thumbnail.status,
  );

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const [qrOpen, setQrOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    // Close sub-views whenever the parent sheet closes so re-opening doesn't
    // restore a stale sub-view.
    if (!visible) {
      setQrOpen(false);
      setPreviewOpen(false);
    }
  }, [visible]);

  const handleCopy = useCallback(async () => {
    if (!data?.share.shareUrl) return;
    await Clipboard.setStringAsync(data.share.shareUrl);
    setCopied(true);
  }, [data?.share.shareUrl]);

  const handleSystemShare = useCallback(async () => {
    if (!data?.share.shareUrl) return;
    try {
      await Share.share({
        message: `${data.share.title}\n${data.share.shareUrl}`,
        url: data.share.shareUrl,
        title: data.share.title,
      });
    } catch {
      /* user cancelled — that's fine */
    }
  }, [data?.share.shareUrl, data?.share.title]);

  const palette = useColors(scheme === 'dark');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={m.share.close}
      />
      <View
        style={[
          styles.panel,
          {
            backgroundColor: palette.surface,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text variant="titleMedium" style={{ color: palette.text }}>
            {m.share.sheetTitle}
          </Text>
        </View>

        {isPending ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={[styles.muted, { color: palette.muted }]}>{m.share.creating}</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.error]}>
              {t(m.share.createFailed, { message: error.message })}
            </Text>
          </View>
        ) : data ? (
          <ShareSheetBody
            payload={data}
            palette={palette}
            thumbStatus={thumbStatus}
            copied={copied}
            onCopy={handleCopy}
            onSystemShare={handleSystemShare}
            onOpenQr={() => setQrOpen(true)}
            onPreview={() => setPreviewOpen(true)}
            onClose={onClose}
            m={m}
          />
        ) : null}
      </View>
      <QrShareView
        visible={qrOpen && Boolean(data)}
        url={data?.share.shareUrl ?? ''}
        title={data?.share.title ?? ''}
        onClose={() => setQrOpen(false)}
        m={m}
      />
      <SharePreviewModal
        visible={previewOpen && Boolean(data)}
        url={data?.share.shareUrl ?? null}
        title={data?.share.title ?? null}
        onClose={() => setPreviewOpen(false)}
      />
    </Modal>
  );
});

// ── Body ────────────────────────────────────────────────────────────────────

type Palette = ReturnType<typeof useColors>;

function ShareSheetBody({
  payload,
  palette,
  thumbStatus,
  copied,
  onCopy,
  onSystemShare,
  onOpenQr,
  onPreview,
  onClose,
  m,
}: {
  payload: ShareAutoPayload;
  palette: Palette;
  thumbStatus: 'ready' | 'pending' | 'gone' | 'unknown' | 'unavailable';
  copied: boolean;
  onCopy: () => void;
  onSystemShare: () => void;
  onOpenQr: () => void;
  onPreview: () => void;
  onClose: () => void;
  m: ReturnType<typeof useMessages>;
}) {
  const router = useRouter();
  const thumbnailUri = thumbnailUrlWithCacheBust(payload.thumbnail.url, thumbStatus);
  const reachability = payload.share.reachability;
  const routingHint = routingLine(payload.routing.reason, m);
  const notPublic = reachability !== 'public';

  return (
    <View style={styles.body}>
      <View style={[styles.thumbnailFrame, { backgroundColor: palette.tile }]}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} resizeMode="cover" />
        ) : null}
        {thumbStatus === 'pending' ? (
          <View style={styles.thumbnailPendingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.thumbnailPendingText}>{m.share.thumbnailPending}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.titleLine, { color: palette.text }]} numberOfLines={2}>
        {payload.share.title}
      </Text>

      <Text style={[styles.urlLine, { color: palette.muted }]} numberOfLines={1} selectable>
        {payload.share.shareUrl}
      </Text>

      <ReachabilityChip
        reachability={reachability}
        hint={payload.share.reachabilityHint}
        palette={palette}
        m={m}
      />

      {notPublic ? (
        <View style={[styles.gateBanner, { borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
          <Icon source="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={[styles.gateBannerText, { color: palette.text }]} numberOfLines={3}>
            {m.share.reachabilityBlocker}
          </Text>
          <Pressable
            onPress={() => {
              onClose();
              router.push('/settings/gateway' as never);
            }}
            style={({ pressed }) => [styles.gateBannerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={m.share.openTunnelSettings}
          >
            <Text style={[styles.gateBannerActionText, { color: palette.primary }]}>
              {m.share.openTunnelSettings}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {routingHint ? (
        <Text style={[styles.routingHint, { color: palette.muted }]} numberOfLines={2}>
          {routingHint}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <ActionButton
          icon={copied ? 'check' : 'content-copy'}
          label={copied ? m.share.actionCopied : m.share.actionCopy}
          onPress={onCopy}
          palette={palette}
        />
        <ActionButton
          icon="qrcode"
          label={m.share.actionQr}
          onPress={onOpenQr}
          palette={palette}
        />
        <ActionButton
          icon="eye-outline"
          label={m.share.actionOpen}
          onPress={onPreview}
          palette={palette}
        />
        <ActionButton
          icon="share-variant"
          label={m.share.actionShare}
          onPress={onSystemShare}
          palette={palette}
          primary
        />
      </View>
    </View>
  );
}

// ── QR full-screen view ─────────────────────────────────────────────────────

function QrShareView({
  visible,
  url,
  title,
  onClose,
  m,
}: {
  visible: boolean;
  url: string;
  title: string;
  onClose: () => void;
  m: ReturnType<typeof useMessages>;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Make the QR square ~80% of the shorter screen edge, capped so it doesn't
  // dominate ultra-wide tablet layouts.
  const qrSize = Math.min(Math.min(width, height) * 0.8, 360);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.qrBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={m.share.close}
      >
        <View
          style={[styles.qrCard, { marginTop: insets.top + 24, marginBottom: insets.bottom + 24 }]}
          // Stop the inner card from forwarding the press to the backdrop.
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.qrTitle}>{m.share.qrTitle}</Text>
          <Text style={styles.qrSubtitle}>{m.share.qrSubtitle}</Text>
          <View style={styles.qrFrame}>
            {url ? <QRCode value={url} size={qrSize} backgroundColor="#FFFFFF" color="#0F172A" /> : null}
          </View>
          <Text style={styles.qrName} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.qrUrl} numberOfLines={1} selectable>
            {url}
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.qrClose, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={m.share.close}
          >
            <Text style={styles.qrCloseText}>{m.share.close}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  palette,
  primary = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  palette: Palette;
  primary?: boolean;
}) {
  const bg = primary ? palette.primary : palette.tile;
  const fg = primary ? '#FFFFFF' : palette.text;
  return (
    <Pressable
      style={({ pressed }) => [styles.actionButton, { backgroundColor: bg }, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon source={icon} size={22} color={fg} />
      <Text style={[styles.actionLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ReachabilityChip({
  reachability,
  hint,
  palette,
  m,
}: {
  reachability: ShareReachability;
  hint: string | null;
  palette: Palette;
  m: ReturnType<typeof useMessages>;
}) {
  const map: Record<ShareReachability, { color: string; dot: string; label: string }> = {
    public: { color: palette.muted, dot: '#22C55E', label: m.share.reachabilityPublic },
    lan: { color: palette.muted, dot: '#F59E0B', label: m.share.reachabilityLan },
    'local-only': { color: '#EF4444', dot: '#EF4444', label: m.share.reachabilityLocal },
  };
  const v = map[reachability];
  return (
    <View style={styles.chipRow}>
      <View style={[styles.chipDot, { backgroundColor: v.dot }]} />
      <Text style={[styles.chipText, { color: v.color }]} numberOfLines={2}>
        {v.label}
        {hint && reachability !== 'local-only' ? ` · ${hint}` : ''}
      </Text>
    </View>
  );
}

function routingLine(
  reason: ShareAutoPayload['routing']['reason'],
  m: ReturnType<typeof useMessages>,
): string {
  switch (reason) {
    case 'html-single-file': return m.share.routingHtmlSingleFile;
    case 'html-with-assets': return m.share.routingHtmlWithAssets;
    case 'small-image': return m.share.routingSmallImage;
    case 'large-binary': return m.share.routingLargeBinary;
    case 'directory-browse': return m.share.routingDirectoryBrowse;
    case 'directory-zip': return m.share.routingDirectoryZip;
    case 'forced': return m.share.routingForced;
    default: return '';
  }
}

function useColors(isDark: boolean) {
  return isDark
    ? {
        surface: '#1C1C1E',
        tile: '#2C2C2E',
        text: '#F5F5F7',
        muted: '#8E8E93',
        primary: '#2563EB',
      }
    : {
        surface: '#FFFFFF',
        tile: '#F2F2F7',
        text: '#1C1C1E',
        muted: '#6D6D70',
        primary: '#2563EB',
      };
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(127,127,127,0.4)',
    marginBottom: 12,
  },
  headerRow: {
    paddingBottom: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  muted: {
    fontSize: 14,
  },
  error: {
    color: '#EF4444',
    textAlign: 'center',
    fontSize: 14,
  },
  body: {
    gap: 12,
  },
  thumbnailFrame: {
    width: '100%',
    aspectRatio: 1200 / 630,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thumbnailPendingText: {
    color: '#fff',
    fontSize: 12,
  },
  titleLine: {
    fontSize: 16,
    fontWeight: '600',
  },
  urlLine: {
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 12,
    flex: 1,
  },
  routingHint: {
    fontSize: 12,
  },
  gateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  gateBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  gateBannerAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  gateBannerActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  qrBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    maxWidth: 420,
    width: '100%',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  qrSubtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
  },
  qrFrame: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  qrName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
  qrUrl: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  qrClose: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  qrCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
});
