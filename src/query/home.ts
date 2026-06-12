import { apiFetch } from '../api/client';
import type { SessionListItem } from './sessions';
import type { NoteIndexEntry } from './notes';

export interface HomeData {
  recentlyOpened: NoteIndexEntry[];
  inboxCount: number;
  pendingTasks: NoteIndexEntry[];
  pendingTaskCount: number;
  recentSessions: SessionListItem[];
}

function normalizedSessionName(session: SessionListItem): string | undefined {
  return session.name?.trim() || session.title?.trim() || session.displayName?.trim() || undefined;
}

export async function fetchHome(): Promise<HomeData> {
  const res = await apiFetch('/api/home');
  if (!res.ok) throw new Error(`Failed to fetch home: ${res.status}`);
  const home = (await res.json()) as HomeData;
  return {
    ...home,
    recentSessions: (home.recentSessions ?? []).map((session) => ({
      ...session,
      name: normalizedSessionName(session),
    })),
  };
}
