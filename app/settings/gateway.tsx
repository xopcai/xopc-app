import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { resolvePreferredBaseUrl } from '../../src/api/connection-strategy';
import { type GatewaySettingsForm, gatewaySettingsSchema } from '../../src/config/schema';
import { useSettingsColors } from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';
import { DEFAULT_GATEWAY_BASE_URL, useGatewayStore } from '../../src/stores/gateway-store';

export default function GatewaySettingsScreen() {
  const router = useRouter();
  const m = useMessages();
  const s = m.settings;
  const g = m.gateway;
  const colors = useSettingsColors();

  const baseUrl = useGatewayStore((st) => st.baseUrl);
  const token = useGatewayStore((st) => st.token);
  const lanUrl = useGatewayStore((st) => st.lanUrl);
  const activeBaseUrl = useGatewayStore((st) => st.activeBaseUrl);
  const setBaseUrl = useGatewayStore((st) => st.setBaseUrl);
  const setLanUrl = useGatewayStore((st) => st.setLanUrl);
  const setToken = useGatewayStore((st) => st.setToken);
  const persist = useGatewayStore((st) => st.persist);
  const refreshActiveBaseUrl = useGatewayStore((st) => st.refreshActiveBaseUrl);

  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<GatewaySettingsForm>({
    resolver: zodResolver(gatewaySettingsSchema),
    defaultValues: {
      baseUrl: baseUrl || DEFAULT_GATEWAY_BASE_URL,
      token: token || '',
    },
  });

  const connectionModeLabel =
    lanUrl && activeBaseUrl === lanUrl.replace(/\/+$/, '')
      ? g.connectionModeLan
      : lanUrl
        ? g.connectionModeTunnel
        : null;

  const handleTestConnection = useCallback(async () => {
    const st = useGatewayStore.getState();
    const tunnel = st.baseUrl.trim();
    if (!tunnel) return;
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const active = await resolvePreferredBaseUrl(tunnel, st.lanUrl ?? undefined);
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
  }, [g.testFailed, g.testOk]);

  const onSubmit = async (data: GatewaySettingsForm) => {
    setBaseUrl(data.baseUrl);
    setLanUrl(null);
    setToken(data.token);
    persist();
    await refreshActiveBaseUrl();
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.pageBg }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="bodySmall" style={[styles.hint, { color: colors.textMuted }]}>
        {s.gatewayHint}
      </Text>

      {connectionModeLabel ? (
        <Text variant="bodySmall" style={[styles.modeLine, { color: colors.textMuted }]}>
          {connectionModeLabel}
        </Text>
      ) : null}

      <Controller
        control={control}
        name="baseUrl"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            label={s.baseUrl}
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
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
        <Button mode="contained" onPress={handleSubmit((d) => void onSubmit(d))}>
          {s.save}
        </Button>
      </View>
    </ScrollView>
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
  modeLine: {
    marginBottom: 12,
    lineHeight: 18,
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
  },
});
