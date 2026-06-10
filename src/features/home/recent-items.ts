/**
 * Unified recent-items list type for Home screen.
 * Merges chat sessions and notes into a single time-sorted feed.
 */
import type { SessionListItem } from '../../query/sessions';
import type { NoteIndexEntry } from '../../query/notes';

export type RecentItemKind = 'chat' | 'note';

export type RecentItem =
  | { kind: 'chat'; key: string; timestamp: number; session: SessionListItem }
  | { kind: 'note'; key: string; timestamp: number; note: NoteIndexEntry };

/** Merge sessions + notes into a single list sorted by most-recent first. */
export function mergeRecentItems(
  sessions: SessionListItem[],
  notes: NoteIndexEntry[],
): RecentItem[] {
  const items: RecentItem[] = [];

  for (const session of sessions) {
    const timestamp = new Date(session.updatedAt).getTime();
    items.push({ kind: 'chat', key: `chat-${session.key}`, timestamp, session });
  }

  for (const note of notes) {
    items.push({ kind: 'note', key: `note-${note.id}`, timestamp: note.updatedAt, note });
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

/** Format a timestamp into a relative time label. */
export function formatRelativeTime(
  timestamp: number,
  labels: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string },
  templateFn: (tpl: string, values: Record<string, string | number>) => string,
): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return labels.justNow;
  if (minutes < 60) return templateFn(labels.minutesAgo, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return templateFn(labels.hoursAgo, { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return templateFn(labels.daysAgo, { n: days });
  return new Date(timestamp).toLocaleDateString();
}
