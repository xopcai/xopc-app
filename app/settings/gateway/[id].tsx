import { zodResolver } from '@hookform/resolvers/zod';
import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { type GatewayProfileForm, gatewayProfileSchema } from '../../../src/config/schema';
import { syncGatewayUrlsFromTunnelQr } from '../../../src/features/gateway/apply-tunnel-qr-from-api';
import { syncAfterGatewaySettingsSave } from '../../../src/features/gateway/gateway-connection-sync';
import {
  GatewayQrScannerModal,
  requestGatewayQrCameraAccess,
} from '../../../src/features/gateway/GatewayQrScannerModal';
import type { ParsedGatewayQr } from '../../../src/features/gateway/parse-gateway-qr';
import { resolveGatewayCredentialsFromQr } from '../../../src/features/gateway/pair-gateway';
import { useSettingsColors } from '../../../src/features/settings/settings-ui';
import { useMessages } from '../../../src/i18n/messages';
import { useGatewayConfigured } from '../../../src/query/sessions';
import { DEFAULT_GATEWAY_BASE_URL, useGatewayStore } from '../../../src/stores/gateway-store';
import { gatewayProfileNameFromUrl } from '../../../src/stores/gateway-types';

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export default function GatewayEditScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const m = useMessages();
  const s = m.settings;
  const g = m.gateway;
  const l = m.gatewayConnect;
  const colors = useSettingsColors();

  const profiles = useGatewayStore((st) => st.profiles);
  const activeGatewayId = useGatewayStore((st) => st.activeGatewayId);
  const addProfile = useGatewayStore((st) => st.addProfile);
  const updateProfile = useGatewayStore((st) => st.updateProfile);
  const removeProfile = useGatewayStore((st) => st.removeProfile);
  const switchGateway = useGatewayStore((st) => st.switchGateway);
  const configured = useGatewayConfigured();

  const existingProfile = useMemo(
    () => (isNew ? null : profiles.find((p) => p.id === id) ?? null),
    [id, isNew, profiles],
  );

  const [pendingLanUrl, setPendingLanUrl] = useState<string | null>(existingProfile?.lanUrl ?? null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<GatewayProfileForm>({
    resolver: zodResolver(gatewayProfileSchema),
    defaultValues: {
      name: existingProfile?.name ?? '',
      baseUrl: existingProfile?.baseUrl || DEFAULT_GATEWAY_BASE_URL,
      token: existingProfile?.token ?? '',
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? s.newGateway : s.editGateway,
    });
  }, [isNew, navigation, s.editGateway, s.newGateway]);

  useEffect(() => {
    if (isNew) return;
    if (!existingProfile) {
      router.replace('/settings/gateway');
    }
  }, [existingProfile, isNew, router]);

  useEffect(() => {
    reset({
      name: existingProfile?.name ?? '',
      baseUrl: existingProfile?.baseUrl || DEFAULT_GATEWAY_BASE_URL,
      token: existingProfile?.token ?? '',
    });
    setPendingLanUrl(existingProfile?.lanUrl ?? null);
  }, [existingProfile, reset]);

  useFocusEffect(
    useCallback(() => {
      if (!configured || isNew) return;
      const tunnel = useGatewayStore.getState().baseUrl.trim();
      if (tunnel && existingProfile?.id === activeGatewayId) {
        void syncGatewayUrlsFromTunnelQr();
      }
    }, [activeGatewayId, configured, existingProfile?.id, isNew]),
  );

  const applyParsedQr = useCallback(
    (parsed: ParsedGatewayQr) => {
      void (async () => {
        if (parsed.pairingSecret && parsed.baseUrl) {
          try {
            const resolved = await resolveGatewayCredentialsFromQr(parsed);
            if (!resolved) return;
            setValue('baseUrl', resolved.baseUrl, { shouldValidate: true });
            setValue('token', resolved.token);
            setValue('name', gatewayProfileNameFromUrl(resolved.baseUrl));
            setPendingLanUrl(resolved.lanUrl);
            setScanNotice(g.qrApplied);
            setTestMessage(null);
            setTestOk(null);
          } catch (err) {
            setScanNotice(err instanceof Error ? err.message : String(err));
          }
          return;
        }

        if (parsed.baseUrl) {
          setValue('baseUrl', parsed.baseUrl, { shouldValidate: true });
          setValue('name', gatewayProfileNameFromUrl(parsed.baseUrl));
        }
        if (parsed.token != null) setValue('token', parsed.token);
        if (parsed.lanUrl) setPendingLanUrl(parsed.lanUrl);
        else setPendingLanUrl(null);
        setScanNotice(g.qrApplied);
        setTestMessage(null);
        setTestOk(null);
      })();
    },
    [g.qrApplied, setValue],
  );

  const openScanner = useCallback(async () => {
    const ok = await requestGatewayQrCameraAccess(
      camPermission,
      requestCamPermission,
      () => setScanNotice(l.cameraDenied),
    );
    if (ok) setScannerOpen(true);
  }, [camPermission, l.cameraDenied, requestCamPermission]);

  const watchedBaseUrl = watch('baseUrl');
  const watchedToken = watch('token');

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const st = useGatewayStore.getState();
      const prev = {
        baseUrl: st.baseUrl,
        lanUrl: st.lanUrl,
        token: st.token,
        activeBaseUrl: st.activeBaseUrl,
      };
      const formBaseUrl = normalizeBaseUrl(watchedBaseUrl ?? '');
      const formToken = watchedToken ?? '';
      if (!formBaseUrl) return;

      useGatewayStore.setState({
        baseUrl: formBaseUrl,
        lanUrl: pendingLanUrl,
        token: formToken,
        activeBaseUrl: formBaseUrl,
      });
      const active = await st.refreshActiveBaseUrl();
      if (!active) return;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const headers: Record<string, string> = {};
      if (formToken) headers.Authorization = `Bearer ${formToken}`;
      const res = await fetch(`${active}/health`, { signal: controller.signal, headers });
      clearTimeout(timeout);

      useGatewayStore.setState(prev);

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
  }, [g.testFailed, g.testOk, pendingLanUrl, watchedBaseUrl, watchedToken]);

  const onSubmit = async (data: GatewayProfileForm) => {
    const nextBaseUrl = normalizeBaseUrl(data.baseUrl);
    const prevBaseUrl = existingProfile ? normalizeBaseUrl(existingProfile.baseUrl) : '';
    const baseUrlChanged = !isNew && prevBaseUrl !== nextBaseUrl;

    setSaving(true);
    try {
      if (isNew) {
        const duplicate = useGatewayStore.getState().findProfileByBaseUrl(nextBaseUrl);
        if (duplicate) {
          updateProfile(duplicate.id, {
            name: data.name,
            baseUrl: data.baseUrl,
            lanUrl: pendingLanUrl,
            token: data.token,
          });
          switchGateway(duplicate.id);
        } else {
          addProfile(
            {
              name: data.name,
              baseUrl: data.baseUrl,
              lanUrl: pendingLanUrl,
              token: data.token,
            },
            { setActive: true },
          );
        }
      } else if (existingProfile) {
        updateProfile(existingProfile.id, {
          name: data.name,
          baseUrl: data.baseUrl,
          lanUrl: pendingLanUrl,
          token: data.token,
        });
        if (existingProfile.id !== activeGatewayId) {
          switchGateway(existingProfile.id);
        }
      }

      await syncAfterGatewaySettingsSave();

      if (isNew || baseUrlChanged) {
        router.replace('/');
      } else {
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = useCallback(() => {
    if (!existingProfile) return;
    Alert.alert(s.deleteGateway, s.deleteGatewayConfirm, [
      { text: m.common.cancel, style: 'cancel' },
      {
        text: s.deleteGateway,
        style: 'destructive',
        onPress: () => {
          const wasActive = existingProfile.id === activeGatewayId;
          removeProfile(existingProfile.id);
          if (wasActive && useGatewayStore.getState().profiles.length === 0) {
            router.replace('/');
          } else {
            router.replace('/settings/gateway');
          }
        },
      },
    ]);
  }, [
    activeGatewayId,
    existingProfile,
    m.common.cancel,
    removeProfile,
    router,
    s.deleteGateway,
    s.deleteGatewayConfirm,
  ]);

  if (!isNew && !existingProfile) {
    return null;
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.pageBg }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {Platform.OS !== 'web' ? (
          <View style={styles.scanRow}>
            <Button mode="outlined" onPress={() => void openScanner()} icon="barcode-scan">
              {l.scanQr}
            </Button>
          </View>
        ) : null}

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              label={s.gatewayName}
              placeholder={s.gatewayNamePlaceholder}
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              mode="outlined"
            />
          )}
        />

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
                setPendingLanUrl(null);
                setTestMessage(null);
                setTestOk(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              mode="outlined"
              error={!!errors.baseUrl}
              style={styles.fieldGap}
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

        {!isNew ? (
          <View style={styles.deleteRow}>
            <Button mode="outlined" textColor="#FF3B30" onPress={confirmDelete}>
              {s.deleteGateway}
            </Button>
          </View>
        ) : null}
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
    paddingBottom: 32,
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
  deleteRow: {
    marginTop: 24,
    alignItems: 'flex-start',
  },
});
