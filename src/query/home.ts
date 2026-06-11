import { apiFetch } from '../api/client';
import type { NoteIndexEntry } from './notes';

export interface HomeData {
  recentlyOpened: NoteIndexEntry[];
  inboxCount: number;
  pendingTasks: NoteIndexEntry[];
  pendingTaskCount: number;
  recentSessions: Array<{ key: string; name: string; updatedAt: number; status: string }>;
}

export async function fetchHome(): Promise<HomeData> {
  const res = await apiFetch('/api/home');
  if (!res.ok) throw new Error(`Failed to fetch home: ${res.status}`);
  return res.json() as Promise<HomeData>;
}
