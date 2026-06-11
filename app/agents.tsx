/**
 * Agents — browse gateway agents, set default, or start a chat.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Text } from 'react-native-paper';

import { FloatingHeader } from '../src/components/FloatingHeader';
import {
  SettingsAgentRow,
  SettingsSection,
  useSettingsColors,
} from '../src/features/settings/settings-ui';
import { pickEffectiveDefaultId, useSetDefaultAgent } from '../src/features/settings/use-set-default-agent';
import { useMessages } from '../src/i18n/messages';
import { openChat, useDismissOnHardwareBack } from '../src/lib/navigation';
import { fetchChatAgents } from '../src/query/agents';
import { queryKeys } from '../src/query/keys';
import { invalidateSessionLists } from '../src/query/workspace-sync';
import { createSession, useGatewayConfigured } from '../src/query/sessions';
import { usePreferencesStore } from '../src/stores/preferences-store';

export default function AgentsScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const colors = useSettingsColors();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const am = m.agentsPage;
  const localOverride = usePreferencesStore((s) => s.defaultAgentId);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: configured,
  });

  const setDefaultMut = useSetDefaultAgent();

  const createMut = useMutation({
    mutationFn: (agentId: string) => createSession(agentId),
    onSuccess: (key) => {
      invalidateSessionLists(queryClient);
      openChat(router, key, { replace: true });
    },
  });

  const agents = agentsQuery.data?.items ?? [];
  const effectiveId = pickEffectiveDefaultId(agentsQuery.data, localOverride);

  const handleChatWith = useCallback(
    (agentId: string) => {
      createMut.mutate(agentId);
    },
    [createMut],
  );

    return (
      <View style={{ flex: 1, backgroundColor: colors.pageBg }}>
        <FloatingHeader title={am.title} onBack={() => router.back()} />
        <View style={styles.center}>
          <Icon source="robot-off-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{am.empty}</Text>
        </View>
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBg }}>
      <FloatingHeader title={am.title} onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
      <Text style={[styles.hint, { color: colors.textMuted }]}>{am.listHint}</Text>

      <SettingsSection>
        {agents.map((agent, i) => {
          const title = agent.name?.trim() || agent.id;
          const selected = agent.id === effectiveId;
          return (
            <SettingsAgentRow
              key={agent.id}
              name={title}
              agentId={agent.id}
              description={agent.description}
              selected={selected}
              isLast={i === agents.length - 1}
              chatLoading={createMut.isPending && createMut.variables === agent.id}
              onSelect={() => {
                if (selected || setDefaultMut.isPending) return;
                setDefaultMut.mutate(agent.id);
              }}
              onChat={() => handleChatWith(agent.id)}
            />
          );
        })}
      </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    marginLeft: 4,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },
});
