import { zodResolver } from '@hookform/resolvers/zod';
import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { type GatewaySettingsForm, gatewaySettingsSchema } from '../../src/config/schema';
import { GatewayConnectionCard } from '../../src/features/gateway/GatewayConnectionCard';
import { GatewayTunnelStatusCard } from '../../src/features/gateway/GatewayTunnelStatusCard';
import { syncGatewayUrlsFromTunnelQr } from '../../src/features/gateway/apply-tunnel-qr-from-api';
import { syncAfterGatewaySettingsSave } from '../../src/features/gateway/gateway-connection-sync';
import { useGatewayHealth } from '../../src/features/gateway/use-gateway-health';
import {
  GatewayQrScannerModal,
  requestGatewayQrCameraAccess,
} from '../../src/features/gateway/GatewayQrScannerModal';
import type { ParsedGatewayQr } from '../../src/features/gateway/parse-gateway-qr';
import { useSettingsColors } from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';
import { useGatewayConfigured } from '../../src/query/sessions';
import { DEFAULT_GATEWAY_BASE_URL, useGatewayStore } from '../../src/stores/gateway-store';

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export default function GatewaySettingsScreen() {
  const router = useRouter();
  const m = useMessages();
  const s = m.settings;
  const g = m.gateway;
  const l = m.gatewayConnect;
  const colors = useSettingsColors();

  const baseUrl = useGatewayStore((st) => st.baseUrl);
  const token = useGatewayStore((st) => st.token);
  const setBaseUrl = useGatewayStore((st) => st.setBaseUrl);
  const setLanUrl = useGatewayStore((st) => st.setLanUrl);
  const setToken = useGatewayStore((st) => st.setToken);
  const persist = useGatewayStore((st) => st.persist);
  const refreshActiveBaseUrl = useGatewayStore((st) => st.refreshActiveBaseUrl);
  const configured = useGatewayConfigured();
  const { gatewayOnline } = useGatewayHealth();

  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [tunnelStatusRefreshToken, setTunnelStatusRefreshToken] = useState(0);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<GatewaySettingsForm>({
    resolver: zodResolver(gatewaySettingsSchema),
    defaultValues: {
      baseUrl: baseUrl || DEFAULT_GATEWAY_BASE_URL,
      token: token || '',
    },
  });

  useFocusEffect(
    useCallback(() => {
      const tunnel = useGatewayStore.getState().baseUrl.trim();
      if (tunnel) void syncGatewayUrlsFromTunnelQr();
      setTunnelStatusRefreshToken((n) => n + 1);
    }, []),
  );

  useEffect(() => {
    setValue('baseUrl', baseUrl || DEFAULT_GATEWAY_BASE_URL);
  }, [baseUrl, setValue]);

  const applyParsedQr = useCallback(
    (parsed: ParsedGatewayQr) => {
      if (parsed.baseUrl) setValue('baseUrl', parsed.baseUrl, { shouldValidate: true });
      if (parsed.token != null) setValue('token', parsed.token);
      if (parsed.lanUrl) setLanUrl(parsed.lanUrl);
      else setLanUrl(null);
      setScanNotice(g.qrApplied);
      setTestMessage(null);
      setTestOk(null);
    },
    [g.qrApplied, setLanUrl, setValue],
  );

  const openScanner = useCallback(async () => {
    const ok = await requestGatewayQrCameraAccess(
      camPermission,
      requestCamPermission,
      () => setScanNotice(l.cameraDenied),
    );
    if (ok) setScannerOpen(true);
  }, [camPermission, l.cameraDenied, requestCamPermission]);

  const handleTestConnection = useCallback(async () => {
    const st = useGatewayStore.getState();
    const tunnel = st.baseUrl.trim();
    if (!tunnel) return;
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const active = await refreshActiveBaseUrl();
      if (!active) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const headers: Record<string, string> = {};
      if (st.token) headers.Authorization = `Bearer ${st.token}`;
      const res = await fetch(`${active}/health`, { signal: controller.signal, headers });
      clearTimeout(timeout);
      if (res.ok) {
        setTestOk(true);
        setTestMessage(g.testOk);
      } else {
        setTestOk(false);
        setTestMessage(`${g.testFailed} (${res.status})`);
      }
    } catch {
      setTestOk(false);
      setTestMessage(g.testFailed);
    } finally {
      setTesting(false);
    }
  }, [g.testFailed, g.testOk, refreshActiveBaseUrl]);

  const onSubmit = async (data: GatewaySettingsForm) => {
    const prevBaseUrl = normalizeBaseUrl(useGatewayStore.getState().baseUrl);
    const nextBaseUrl = normalizeBaseUrl(data.baseUrl);
    const baseUrlChanged = prevBaseUrl !== nextBaseUrl;

    setSaving(true);
    try {
      setBaseUrl(data.baseUrl);
      setToken(data.token);
      persist();
      await syncAfterGatewaySettingsSave();
      if (baseUrlChanged) {
        router.replace('/');
      } else {
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.pageBg }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="bodySmall" style={[styles.hint, { color: colors.textMuted }]}>
          {s.gatewayHint}
        </Text>

        <GatewayConnectionCard
          gatewayReachable={gatewayOnline}
          onSyncNotice={(message) => setScanNotice(message)}
        />

        {configured ? (
          <GatewayTunnelStatusCard refreshToken={tunnelStatusRefreshToken} />
        ) : null}

        {Platform.OS !== 'web' ? (
          <View style={styles.scanRow}>
            <Button mode="outlined" onPress={() => void openScanner()} icon="barcode-scan">
              {l.scanQr}
            </Button>
          </View>
        ) : null}

        <Controller
          control={control}
          name="baseUrl"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              label={s.baseUrl}
              value={value}
              onBlur={onBlur}
              onChangeText={(text) => {
                onChange(text);
                setLanUrl(null);
                setTestMessage(null);
                setTestOk(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              mode="outlined"
              error={!!errors.baseUrl}
            />
          )}
        />
        <HelperText type="error" visible={!!errors.baseUrl}>
          {errors.baseUrl?.message}
        </HelperText>

        <Controller
          control={control}
          name="token"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              label={s.token}
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              autoCapitalize="none"
              secureTextEntry
              mode="outlined"
              style={styles.fieldGap}
            />
          )}
        />

        <View style={styles.testRow}>
          <Button mode="outlined" loading={testing} disabled={testing} onPress={() => void handleTestConnection()}>
            {testing ? g.testingConnection : g.testConnection}
          </Button>
        </View>
        {testMessage ? (
          <HelperText type={testOk ? 'info' : 'error'} visible>
            {testMessage}
          </HelperText>
        ) : null}

        <View style={styles.saveRow}>
          <Button
            mode="contained"
            loading={saving}
            disabled={saving}
            onPress={handleSubmit((d) => void onSubmit(d))}
          >
            {s.save}
          </Button>
          <Text variant="bodySmall" style={[styles.applyHint, { color: colors.textMuted }]}>
            {g.applyImmediatelyHint}
          </Text>
        </View>
      </ScrollView>

      <GatewayQrScannerModal
        visible={scannerOpen}
        onRequestClose={() => setScannerOpen(false)}
        onScanned={applyParsedQr}
        onCameraDenied={() => setScanNotice(l.cameraDenied)}
      />

      <Snackbar visible={Boolean(scanNotice)} onDismiss={() => setScanNotice(null)} duration={3200}>
        {scanNotice}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
  },
  hint: {
    marginBottom: 16,
    lineHeight: 20,
  },
  scanRow: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  fieldGap: {
    marginTop: 8,
  },
  testRow: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  saveRow: {
    marginTop: 24,
    gap: 8,
  },
  applyHint: {
    lineHeight: 18,
  },
});
