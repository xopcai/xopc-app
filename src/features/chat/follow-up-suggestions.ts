import type { Message, MessageContent } from './messages.types';

export type FollowUpSuggestionId =
  | 'code_explain'
  | 'code_refactor'
  | 'web_more_details'
  | 'generic_simpler_terms'
  | 'generic_concrete_example'
  | 'generic_bullet_points'
  | 'what_next';

const MAX_ASSISTANT_CHARS = 1000;

function collectAssistantPlainText(content: MessageContent[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function hasCodeSignal(text: string): boolean {
  return /```|\b(function|class|const|let|var|import|export|async|await|interface|type|return)\b|\b(if|for|while)\s*\(/i.test(text);
}

function hasWebSignal(text: string): boolean {
  return /https?:\/\/|\[[^\]]+\]\([^)]+\)|\bRFC\s*\d+|参考|来源|链接/i.test(text);
}

function hasListSignal(text: string): boolean {
  return /^\s*[-*•]\s|\n\s*[-*•]\s|\n\s*\d+\.\s/.test(text);
}

export function followUpPromptForSuggestionId(id: FollowUpSuggestionId): string {
  const prompts: Record<FollowUpSuggestionId, string> = {
    code_explain: 'Explain that code step by step.',
    code_refactor: 'Refactor that code for readability while preserving behavior.',
    web_more_details: 'Search for more details online and summarize what you find.',
    generic_simpler_terms: 'Explain that again in simpler terms.',
    generic_concrete_example: 'Give a concrete example that illustrates the main idea.',
    generic_bullet_points: 'Summarize the answer as concise bullet points.',
    what_next: 'What should I do next based on your answer?',
  };
  return prompts[id];
}

export function suggestFollowUpsFromAssistantMessage(message: Message): FollowUpSuggestionId[] {
  if (message.role !== 'assistant') return [];

  const rawText = collectAssistantPlainText(message.content);
  if (!rawText) return [];

  const text = rawText.slice(0, MAX_ASSISTANT_CHARS);
  const suggestions: FollowUpSuggestionId[] = [];

  if (hasCodeSignal(text)) {
    suggestions.push('code_explain', 'code_refactor');
  }

  if (hasWebSignal(text)) {
    suggestions.push('web_more_details');
  }

  if (!hasListSignal(text)) {
    suggestions.push('generic_bullet_points');
  }

  suggestions.push('generic_simpler_terms', 'generic_concrete_example', 'what_next');

  return [...new Set(suggestions)].slice(0, 4);
}
