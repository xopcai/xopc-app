import {
  DEFAULT_FOLLOW_UP_CAPABILITIES,
  type FollowUpCapabilities,
  type ToolUseSummary,
} from './follow-up-context';

const TOOL_UNAVAILABLE_RE =
  /not available|unavailable|disabled|unsupported|forbidden|permission denied|无权限|未启用|不可用/i;

function toolFailedUnavailable(name: string, uses: ToolUseSummary[]): boolean {
  return uses.some(
    (t) =>
      t.name === name &&
      t.status === 'error' &&
      TOOL_UNAVAILABLE_RE.test(t.resultPreview ?? ''),
  );
}

/**
 * Refine follow-up capability flags from observed tool outcomes in the current turn
 * (and optional session history). Successful uses keep defaults; hard failures disable caps.
 */
export function inferFollowUpCapabilities(
  toolUses: ToolUseSummary[],
  sessionToolUses: ToolUseSummary[] = [],
  partial?: Partial<FollowUpCapabilities>,
): FollowUpCapabilities {
  const merged = [...sessionToolUses, ...toolUses];
  const cap: FollowUpCapabilities = {
    ...DEFAULT_FOLLOW_UP_CAPABILITIES,
    ...partial,
  };

  if (toolFailedUnavailable('web_search', merged)) {
    cap.capWebSearch = false;
    cap.capWebFetch = false;
  }
  if (toolFailedUnavailable('shell', merged)) {
    cap.capShell = false;
  }
  if (
    toolFailedUnavailable('browser_use', merged) ||
    merged.some((t) => t.name.startsWith('browser_') && t.status === 'error' && TOOL_UNAVAILABLE_RE.test(t.resultPreview ?? ''))
  ) {
    cap.capBrowser = false;
  }

  const cronNames = new Set(['cron', 'schedule', 'scheduled_task', 'create_cron']);
  if (merged.some((t) => cronNames.has(t.name) && t.status === 'error' && TOOL_UNAVAILABLE_RE.test(t.resultPreview ?? ''))) {
    cap.capCron = false;
  }

  return cap;
}

/** Accumulate tool-use summaries for capability inference across a session (deduped by recency). */
export function mergeSessionToolUses(
  prev: ToolUseSummary[],
  next: ToolUseSummary[],
  max = 24,
): ToolUseSummary[] {
  const out = [...prev, ...next];
  return out.slice(-max);
}
