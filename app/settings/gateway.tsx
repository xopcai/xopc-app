import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { type GatewaySettingsForm, gatewaySettingsSchema } from '../../src/config/schema';
import { useSettingsColors } from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';
import { DEFAULT_GATEWAY_BASE_URL, useGatewayStore } from '../../src/stores/gateway-store';

export default function GatewaySettingsScreen() {
  const router = useRouter();
  const m = useMessages();
  const s = m.settings;
  const colors = useSettingsColors();

  const baseUrl = useGatewayStore((st) => st.baseUrl);
  const token = useGatewayStore((st) => st.token);
  const setBaseUrl = useGatewayStore((st) => st.setBaseUrl);
  const setToken = useGatewayStore((st) => st.setToken);
  const persist = useGatewayStore((st) => st.persist);

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

  const onSubmit = (data: GatewaySettingsForm) => {
    setBaseUrl(data.baseUrl);
    setToken(data.token);
    persist();
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
      <View style={styles.saveRow}>
        <Button mode="contained" onPress={handleSubmit(onSubmit)}>
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
  fieldGap: {
    marginTop: 8,
  },
  saveRow: {
    marginTop: 24,
  },
});
