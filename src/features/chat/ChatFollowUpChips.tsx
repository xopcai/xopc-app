import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { FollowUpSuggestionId } from './follow-up-suggestions';
import { useMessages, type MessageBundle } from '../../i18n/messages';

function labelForFollowUpId(
  chat: MessageBundle['chat'],
  id: FollowUpSuggestionId,
): string {
  switch (id) {
    case 'code_error_handling':
      return chat.followUpChipErrorHandling;
    case 'code_refactor':
      return chat.followUpChipRefactorReadability;
    case 'code_explain':
      return chat.followUpChipCodeExplain;
    case 'code_optimize':
      return chat.followUpChipCodeOptimize;
    case 'code_add_tests':
      return chat.followUpChipCodeAddTests;
    case 'code_fix_error':
      return chat.followUpChipCodeFixError;
    case 'web_more_details':
      return chat.followUpChipWebMoreDetails;
    case 'web_find_sources':
      return chat.followUpChipWebFindSources;
    case 'web_verify_claim':
      return chat.followUpChipWebVerifyClaim;
    case 'research_deeper':
      return chat.followUpChipResearchDeeper;
    case 'date_shorter_summary':
      return chat.followUpChipShorterSummary;
    case 'date_main_risks':
      return chat.followUpChipMainRisks;
    case 'email_make_formal':
      return chat.followUpChipEmailMakeFormal;
    case 'email_shorten':
      return chat.followUpChipEmailShorten;
    case 'generic_simpler_terms':
      return chat.followUpChipSimplerTerms;
    case 'generic_concrete_example':
      return chat.followUpChipConcreteExample;
    case 'generic_bullet_points':
      return chat.followUpChipBulletPoints;
    case 'generic_create_table':
      return chat.followUpChipCreateTable;
    case 'generic_action_checklist':
      return chat.followUpChipGenericActionChecklist;
    case 'generic_assumptions':
      return chat.followUpChipGenericAssumptions;
    case 'learn_technical_detail':
      return chat.followUpChipLearnTechnicalDetail;
    case 'learn_build_walkthrough':
      return chat.followUpChipLearnBuildWalkthrough;
    case 'learn_compare_alternatives':
      return chat.followUpChipLearnCompareAlternatives;
    case 'wf_run_checks':
      return chat.followUpChipWfRunChecks;
    case 'wf_git_commit':
      return chat.followUpChipWfGitCommit;
    case 'wf_compare_options':
      return chat.followUpChipWfCompareOptions;
    case 'wf_verify_acceptance':
      return chat.followUpChipWfVerifyAcceptance;
    case 'ops_fix_config':
      return chat.followUpChipOpsFixConfig;
    case 'ops_channel_next':
      return chat.followUpChipOpsChannelNext;
    case 'ops_schedule_cron':
      return chat.followUpChipOpsScheduleCron;
    case 'what_next':
      return chat.followUpChipWhatNext;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export const ChatFollowUpChips = memo(function ChatFollowUpChips({
  suggestions,
  disabled,
  onPick,
}: {
  suggestions: FollowUpSuggestionId[];
  disabled?: boolean;
  onPick: (id: FollowUpSuggestionId) => void;
}) {
  const m = useMessages();
  const isDark = useColorScheme() === 'dark';
  const pillText = isDark ? '#F5F5F7' : '#1C1C1E';

  if (suggestions.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="adjustable"
      accessibilityLabel={m.chat.followUpSuggestionsAria}
      contentContainerStyle={styles.row}
    >
      {suggestions.map((id) => {
        const label = labelForFollowUpId(m.chat, id);
        return (
          <Pressable
            key={id}
            disabled={disabled}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(120,120,128,0.22)',
                opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
              },
            ]}
            onPress={() => onPick(id)}
          >
            <Text style={[styles.chipText, { color: pillText }]} numberOfLines={2}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    maxWidth: 260,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
