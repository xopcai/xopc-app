import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './keys';

/** Invalidate aggregated home feed (recent sessions, notes, inbox counts). */
export function invalidateHomeFeed(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.home });
}

/** Invalidate session lists used in chat drawer and home recent sessions. */
export function invalidateSessionLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
  invalidateHomeFeed(queryClient);
}

/** Invalidate note lists used in notes tab and home continue rail. */
export function invalidateNoteLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notesAll });
  invalidateHomeFeed(queryClient);
}
