import { describe, expect, it } from 'vitest';

import {
  followUpPromptForSuggestionId,
  suggestFollowUpsFromAssistantMessage,
} from '../follow-up-suggestions';
import type { Message } from '../messages.types';

function assistantMessage(text: string): Message {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
  };
}

describe('suggestFollowUpsFromAssistantMessage', () => {
  it('suggests code follow-ups for code answers', () => {
    const suggestions = suggestFollowUpsFromAssistantMessage(
      assistantMessage('```ts\nfunction add(value: number) { return value + 1; }\n```'),
    );

    expect(suggestions).toContain('code_explain');
    expect(suggestions).toContain('code_refactor');
  });

  it('suggests generic follow-ups for normal answers', () => {
    const suggestions = suggestFollowUpsFromAssistantMessage(
      assistantMessage('This can be improved by keeping the workflow short and focused.'),
    );

    expect(suggestions).toContain('generic_bullet_points');
    expect(suggestions).toContain('what_next');
  });

  it('maps stable ids to prompt text', () => {
    expect(followUpPromptForSuggestionId('what_next')).toBeTruthy();
  });
});
