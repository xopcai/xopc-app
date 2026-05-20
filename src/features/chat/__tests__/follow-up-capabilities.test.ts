import { describe, expect, it } from 'vitest';

import { inferFollowUpCapabilities } from '../follow-up-capabilities';
import { DEFAULT_FOLLOW_UP_CAPABILITIES } from '../follow-up-context';

describe('inferFollowUpCapabilities', () => {
  it('keeps defaults when tools succeed', () => {
    expect(
      inferFollowUpCapabilities([{ name: 'web_search', status: 'done' }]),
    ).toEqual(DEFAULT_FOLLOW_UP_CAPABILITIES);
  });

  it('disables web when search is unavailable', () => {
    const cap = inferFollowUpCapabilities([
      { name: 'web_search', status: 'error', resultPreview: 'web_search tool not available' },
    ]);
    expect(cap.capWebSearch).toBe(false);
    expect(cap.capWebFetch).toBe(false);
    expect(cap.capShell).toBe(true);
  });

  it('disables shell when shell errors as forbidden', () => {
    const cap = inferFollowUpCapabilities([
      { name: 'shell', status: 'error', resultPreview: 'permission denied' },
    ]);
    expect(cap.capShell).toBe(false);
  });
});
