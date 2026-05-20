import type { FollowUpContextPack } from './follow-up-context';
import type { FollowUpPromptLocale } from './follow-up-prompts';
import type { FollowUpSuggestionId } from './follow-up-suggestions.types';

export type FollowUpAnchorContext = {
  topicHint: string;
  userSnippet: string;
  assistantSnippet: string;
};

export type FollowUpSuggestionDisplay = {
  id: FollowUpSuggestionId;
  label: string;
};

const MAX_TOPIC_LEN = 28;
const MAX_USER_SNIPPET = 200;
const MAX_ASSISTANT_SNIPPET = 120;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function cleanTopic(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[，,；;：:]+$/g, '').trim();
}

/** Short topic phrase from the user's message for chip labels and prompts. */
export function extractTopicHint(userText: string, maxLen = MAX_TOPIC_LEN): string {
  const t = userText.trim();
  if (!t) return '';

  const quoted = t.match(/[「『"']([^」』"'\n]{2,48})[」』"']/);
  if (quoted?.[1]) return truncate(cleanTopic(quoted[1]), maxLen);

  const vs = t.match(/(.{2,24})\s*(?:还是|vs\.?|versus|和)\s*(.{2,24})/i);
  if (vs) {
    return truncate(cleanTopic(`${vs[1]!.trim()} vs ${vs[2]!.trim()}`), maxLen);
  }

  const stem = t.match(
    /(?:关于|讲讲|解释|什么是|如何|怎么|介绍一下|compare|explain|what is|how to)\s*[：:]?\s*(.{2,48})/i,
  );
  if (stem?.[1]) return truncate(cleanTopic(stem[1]), maxLen);

  const stripped = t
    .replace(/^(请|帮我|能不能|可以|麻烦|我想|能否)\s*/i, '')
    .replace(/^(what is|how do i|how to|please|can you|could you)\s+/i, '')
    .replace(/[？?。！!]+$/, '')
    .trim();
  if (stripped.length >= 2) return truncate(cleanTopic(stripped), maxLen);

  return '';
}

export function buildFollowUpAnchor(ctx: FollowUpContextPack): FollowUpAnchorContext {
  return {
    topicHint: extractTopicHint(ctx.userText),
    userSnippet: truncate(ctx.userText, MAX_USER_SNIPPET),
    assistantSnippet: truncate(ctx.assistantText, MAX_ASSISTANT_SNIPPET),
  };
}

/** Chip ids that support a `{topic}`-aware label when a topic hint exists. */
const TOPIC_LABEL_IDS = new Set<FollowUpSuggestionId>([
  'research_deeper',
  'web_more_details',
  'generic_concrete_example',
  'generic_simpler_terms',
  'learn_technical_detail',
  'learn_build_walkthrough',
  'learn_compare_alternatives',
  'wf_compare_options',
  'what_next',
]);

const TOPIC_LABEL_TEMPLATES: Partial<
  Record<FollowUpSuggestionId, Record<FollowUpPromptLocale, string>>
> = {
  research_deeper: {
    en: 'Research «{topic}» further',
    zh: '深入检索「{topic}」',
  },
  web_more_details: {
    en: 'Find more on «{topic}» online',
    zh: '搜索「{topic}」更多资料',
  },
  generic_concrete_example: {
    en: 'Example of «{topic}»',
    zh: '举例说明「{topic}」',
  },
  generic_simpler_terms: {
    en: 'Explain «{topic}» simply',
    zh: '通俗解释「{topic}」',
  },
  learn_technical_detail: {
    en: 'Technical details of «{topic}»',
    zh: '「{topic}」的技术细节',
  },
  learn_build_walkthrough: {
    en: 'Build «{topic}» step by step',
    zh: '一步步搭建「{topic}」',
  },
  learn_compare_alternatives: {
    en: 'Compare «{topic}» alternatives',
    zh: '对比「{topic}」的替代方案',
  },
  wf_compare_options: {
    en: 'Compare options: «{topic}»',
    zh: '对比方案：「{topic}」',
  },
  what_next: {
    en: 'Next steps for «{topic}»',
    zh: '「{topic}」下一步做什么',
  },
};

export function followUpChipLabel(
  id: FollowUpSuggestionId,
  locale: FollowUpPromptLocale,
  anchor: FollowUpAnchorContext | null,
  baseLabel: string,
): string {
  const topic = anchor?.topicHint?.trim();
  if (!topic || !TOPIC_LABEL_IDS.has(id)) return baseLabel;
  const tmpl = TOPIC_LABEL_TEMPLATES[id]?.[locale] ?? TOPIC_LABEL_TEMPLATES[id]?.en;
  if (!tmpl) return baseLabel;
  return tmpl.replace('{topic}', topic);
}

export function buildFollowUpDisplays(
  ids: FollowUpSuggestionId[],
  locale: FollowUpPromptLocale,
  anchor: FollowUpAnchorContext | null,
  baseLabelForId: (id: FollowUpSuggestionId) => string,
): FollowUpSuggestionDisplay[] {
  return ids.map((id) => ({
    id,
    label: followUpChipLabel(id, locale, anchor, baseLabelForId(id)),
  }));
}
