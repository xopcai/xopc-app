import { memo } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
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
  const borderColor = isDark ? 'rgba(180,180,190,0.35)' : 'rgba(120,120,128,0.35)';
  const chipBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const chipBgPressed = isDark ? '#2C2C2E' : '#F5F5F7';

  if (suggestions.length === 0) return null;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="list"
      accessibilityLabel={m.chat.followUpSuggestionsAria}
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
                borderColor,
                backgroundColor: pressed && !disabled ? chipBgPressed : chipBg,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
            onPress={() => onPick(id)}
          >
            <Text style={[styles.chipText, { color: pillText }]} numberOfLines={3}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    width: '92%',
    maxWidth: '92%',
    marginTop: -4,
    marginBottom: 8,
    gap: 8,
  },
  chip: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  chipText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'left',
  },
});
