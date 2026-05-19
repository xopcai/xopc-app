import type { Router } from 'expo-router';

import { createSession } from '../../query/sessions';

/**
 * After gateway credentials are saved, open a fresh chat session.
 */
export async function openDefaultSessionAfterConnect(
  replace: Router['replace'],
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const key = await createSession(undefined);
    replace({ pathname: '/', params: { k: key } });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
