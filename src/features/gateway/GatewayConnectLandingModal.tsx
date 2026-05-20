/**
 * Full-screen connect flow when no gateway base URL is stored (mirrors web GatewayConnectLanding).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { Button, IconButton, Text, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gatewaySettingsSchema } from '../../config/schema';
import { useMessages } from '../../i18n/messages';
import { queryKeys } from '../../query/keys';
import { DEFAULT_GATEWAY_BASE_URL, useGatewayStore } from '../../stores/gateway-store';
import { syncAfterGatewaySettingsSave } from './gateway-connection-sync';
import {
  GatewayQrScannerModal,
  requestGatewayQrCameraAccess,
} from './GatewayQrScannerModal';
import type { ParsedGatewayQr } from './parse-gateway-qr';
import { resolveGatewayCredentialsFromQr } from './pair-gateway';
import { openDefaultSessionAfterConnect } from './navigate-after-gateway-connect';

export type GatewayConnectLandingModalProps = {
  visible: boolean;
  /** User closed the sheet without finishing setup — parent resets route to home. */
  onRequestClose: () => void;
};

export function GatewayConnectLandingModal({ visible, onRequestClose }: GatewayConnectLandingModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const l = m.gatewayConnect;
  const s = m.settings;

  const unauthorized = useGatewayStore((st) => st.unauthorized);
  const setBaseUrl = useGatewayStore((st) => st.setBaseUrl);
  const setLanUrl = useGatewayStore((st) => st.setLanUrl);
  const setToken = useGatewayStore((st) => st.setToken);
  const persist = useGatewayStore((st) => st.persist);

  const [baseUrl, setBaseUrlField] = useState(DEFAULT_GATEWAY_BASE_URL);
  const [token, setTokenField] = useState('');
  const [baseUrlError, setBaseUrlError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  useEffect(() => {
    if (!visible) return;
    const st = useGatewayStore.getState();
    setBaseUrlField(st.baseUrl.trim() || DEFAULT_GATEWAY_BASE_URL);
    setTokenField(st.token);
    setBaseUrlError('');
    setSaveError('');
  }, [visible]);

  /** Match web token-expired UX: cannot dismiss landing with hardware back while 401. */
  useEffect(() => {
    if (!visible || !unauthorized) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible, unauthorized]);

  const colors = {
    bg: isDark ? '#000000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    border: isDark ? '#38383A' : '#E5E5EA',
    text: isDark ? '#F5F5F7' : '#1C1C1E',
    muted: isDark ? '#8E8E93' : '#6D6D70',
    dangerBg: isDark ? 'rgba(255,59,48,0.15)' : 'rgba(255,59,48,0.12)',
    dangerBorder: isDark ? 'rgba(255,59,48,0.35)' : 'rgba(255,59,48,0.3)',
  };

  const applyParsed = useCallback((parsed: ParsedGatewayQr) => {
    void (async () => {
      if (parsed.pairingSecret && parsed.baseUrl) {
        setSaveError('');
        setSaving(true);
        try {
          const resolved = await resolveGatewayCredentialsFromQr(parsed);
          if (!resolved) return;
          setBaseUrlField(resolved.baseUrl);
          setTokenField(resolved.token);
          setLanUrl(resolved.lanUrl);
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : String(err));
        } finally {
          setSaving(false);
        }
        return;
      }

      if (parsed.baseUrl) setBaseUrlField(parsed.baseUrl);
      if (parsed.token != null) setTokenField(parsed.token);
      if (parsed.lanUrl) setLanUrl(parsed.lanUrl);
      else setLanUrl(null);
    })();
  }, [setLanUrl]);

  const openScanner = useCallback(async () => {
    const ok = await requestGatewayQrCameraAccess(
      camPermission,
      requestCamPermission,
      () => setSaveError(l.cameraDenied),
    );
    if (ok) setScannerOpen(true);
  }, [camPermission, l.cameraDenied, requestCamPermission]);

  const handleSave = useCallback(async () => {
    setSaveError('');
    setBaseUrlError('');
    const parsed = gatewaySettingsSchema.safeParse({
      baseUrl: baseUrl.trim(),
      token: token.trim(),
    });
    if (!parsed.success) {
      const urlIssue = parsed.error.flatten().fieldErrors.baseUrl?.[0];
      setBaseUrlError(urlIssue ?? l.invalidUrl);
      return;
    }

    const before = {
      baseUrl: useGatewayStore.getState().baseUrl,
      token: useGatewayStore.getState().token,
    };
    setSaving(true);
    try {
      setBaseUrl(parsed.data.baseUrl);
      setToken(parsed.data.token);
      persist();
      await syncAfterGatewaySettingsSave();

      const nav = await openDefaultSessionAfterConnect(router.replace);
      if (!nav.ok) {
        setBaseUrl(before.baseUrl);
        setToken(before.token);
        persist();
        setSaveError(nav.message || l.connectFailed);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    } finally {
      setSaving(false);
    }
  }, [
    baseUrl,
    token,
    l.connectFailed,
    l.invalidUrl,
    persist,
    queryClient,
    router.replace,
    setBaseUrl,
    setLanUrl,
    setToken,
  ]);

  const goFullSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const requestClose = useCallback(() => {
    if (unauthorized) return;
    onRequestClose();
  }, [onRequestClose, unauthorized]);

  const landingContent = (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <View style={{ width: 48 }} />
        <Text variant="titleMedium" style={{ color: colors.text }}>
          {l.title}
        </Text>
        {unauthorized ? (
          <View style={{ width: 48 }} />
        ) : (
          <IconButton icon="close" size={22} onPress={requestClose} accessibilityLabel={l.close} />
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text variant="titleLarge" style={[styles.headline, { color: colors.text }]}>
            {l.headline}
          </Text>
          <Text variant="bodyMedium" style={[styles.subline, { color: colors.muted }]}>
            {l.subline}
          </Text>

          {unauthorized ? (
            <View
              style={[
                styles.banner,
                { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
              ]}
            >
              <Text variant="bodySmall" style={{ color: colors.text }}>
                {l.sessionExpired}
              </Text>
            </View>
          ) : null}

          <Text variant="bodySmall" style={[styles.steps, { color: colors.muted }]}>
            {l.step1}
            {'\n'}
            {l.step2}
            {'\n'}
            {l.step3}
          </Text>

          <TextInput
            label={s.baseUrl}
            value={baseUrl}
            onChangeText={(text) => {
              setBaseUrlField(text);
              setBaseUrlError('');
            }}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            error={Boolean(baseUrlError)}
            style={styles.field}
          />
          {baseUrlError ? (
            <Text variant="bodySmall" style={styles.fieldError}>
              {baseUrlError}
            </Text>
          ) : null}

          <TextInput
            label={s.token}
            value={token}
            onChangeText={setTokenField}
            mode="outlined"
            autoCapitalize="none"
            secureTextEntry
            style={styles.field}
          />
          <View style={styles.row}>
            <Button mode="outlined" onPress={openScanner} icon="barcode-scan">
              {l.scanQr}
            </Button>
          </View>

          {saveError ? (
            <Text variant="bodySmall" style={styles.saveError}>
              {saveError}
            </Text>
          ) : null}

          <View style={[styles.actions, unauthorized && styles.actionsSingle]}>
            {!unauthorized ? (
              <Button mode="text" onPress={goFullSettings}>
                {l.openFullSettings}
              </Button>
            ) : null}
            <Button mode="contained" onPress={() => void handleSave()} loading={saving} disabled={saving}>
              {l.saveContinue}
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View style={styles.webOverlay}>
        {landingContent}
        <GatewayQrScannerModal
          visible={scannerOpen}
          onRequestClose={() => setScannerOpen(false)}
          onScanned={applyParsed}
          onCameraDenied={() => setSaveError(l.cameraDenied)}
        />
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={requestClose}
    >
      {landingContent}
      <GatewayQrScannerModal
        visible={scannerOpen}
        onRequestClose={() => setScannerOpen(false)}
        onScanned={applyParsed}
        onCameraDenied={() => setSaveError(l.cameraDenied)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  headline: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subline: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  banner: {
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  steps: {
    marginTop: 12,
    lineHeight: 22,
  },
  field: {
    marginTop: 14,
    backgroundColor: 'transparent',
  },
  fieldError: {
    color: '#FF3B30',
    marginTop: 4,
  },
  row: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  saveError: {
    color: '#FF3B30',
    marginTop: 12,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  actionsSingle: {
    justifyContent: 'flex-end',
  },
});
