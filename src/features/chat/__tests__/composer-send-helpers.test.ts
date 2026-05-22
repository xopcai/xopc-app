import { describe, expect, it } from 'vitest';

import { shouldShowFollowUpChips } from '../composer-send-helpers';
import type { Message } from '../messages.types';

const assistant: Message = { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] };

describe('shouldShowFollowUpChips', () => {
  it('hides chips while assistant message is still streaming', () => {
    expect(
      shouldShowFollowUpChips({
        streaming: true,
        followUpSuggestions: [{ id: 'what_next', label: 'Next?' }],
        onFollowUpPick: () => {},
        messages: [assistant],
      }),
    ).toBe(false);
  });

  it('shows chips after stream completes when last message is assistant', () => {
    expect(
      shouldShowFollowUpChips({
        streaming: false,
        followUpSuggestions: [{ id: 'what_next', label: 'Next?' }],
        onFollowUpPick: () => {},
        messages: [assistant],
      }),
    ).toBe(true);
  });
});
