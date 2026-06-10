/**
 * Shared session-list helpers — used by DrawerContent and ChatsScreen.
 */
import type { SessionListItem } from '../query/sessions';

/** Group sessions by time period for sectioned list display. */
export function groupSessions(
  items: SessionListItem[],
  labels: { sectionThisWeek: string; sectionThisYear: string; sectionEarlier: string },
): { title: string; data: SessionListItem[] }[] {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  const thisWeek: SessionListItem[] = [];
  const thisYear: SessionListItem[] = [];
  const earlier: SessionListItem[] = [];

  for (const s of items) {
    const time = new Date(s.updatedAt).getTime();
    if (Number.isNaN(time)) {
      earlier.push(s);
      continue;
    }
    if (time >= weekAgo) thisWeek.push(s);
    else if (time >= yearStart) thisYear.push(s);
    else earlier.push(s);
  }

  const out: { title: string; data: SessionListItem[] }[] = [];
  if (thisWeek.length) out.push({ title: labels.sectionThisWeek, data: thisWeek });
  if (thisYear.length) out.push({ title: labels.sectionThisYear, data: thisYear });
  if (earlier.length) out.push({ title: labels.sectionEarlier, data: earlier });
  return out;
}

/** Display name for a session — falls back to truncated key. */
export function sessionDisplayName(item: SessionListItem): string {
  if (item.name?.trim()) return item.name.trim();
  const key = item.key;
  return key.length > 24 ? `…${key.slice(-24)}` : key;
}
