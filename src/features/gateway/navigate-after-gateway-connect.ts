import type { Router } from 'expo-router';

import { createSession, fetchSessionsList } from '../../query/sessions';

/**
 * After gateway credentials are saved, open the most recently updated session,
 * or create a new one when the list is empty.
 */
export async function openDefaultSessionAfterConnect(
  replace: Router['replace'],
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const list = await fetchSessionsList();
    if (list.length > 0) {
      replace({ pathname: '/', params: { k: list[0].key } });
      return { ok: true };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  try {
    const key = await createSession(undefined);
    replace({ pathname: '/', params: { k: key } });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
