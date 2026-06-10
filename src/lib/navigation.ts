import { useFocusEffect, type ImperativeRouter } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';

type ChatRouteParams = { k: string; msg?: string };

export function chatRoute(key: string, msg?: string): { pathname: '/chat/[k]'; params: ChatRouteParams } {
  const params: ChatRouteParams = { k: key };
  if (msg) params.msg = msg;
  return { pathname: '/chat/[k]', params };
}

export function openChat(
  router: ImperativeRouter,
  key: string,
  options?: { msg?: string; replace?: boolean },
): void {
  const href = chatRoute(key, options?.msg);
  if (options?.replace) router.replace(href);
  else router.push(href);
}

type NoteDetailOptions = {
  heading?: string;
  range?: { start: number; end: number };
};

/** Canonical note detail route — always `/items/:id`. */
export function openNoteDetail(router: ImperativeRouter, noteId: string, options?: NoteDetailOptions): void {
  if (options?.heading?.trim() || options?.range) {
    const params: { id: string; heading?: string; start?: string; end?: string } = { id: noteId };
    if (options.heading?.trim()) params.heading = options.heading.trim();
    if (options.range) {
      params.start = String(options.range.start);
      params.end = String(options.range.end);
    }
    router.push({
      pathname: '/items/[id]',
      params,
    });
    return;
  }
  router.push(`/items/${noteId}`);
}

/**
 * Leave a modal (or any screen) without assuming a parent route exists.
 * Cold start / deep links can mount only `settings`, so `router.back()` throws LogBox "GO_BACK was not handled".
 */
export function dismissOrHome(router: ImperativeRouter): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/** Android hardware back when this screen is the only stack entry must not dispatch unhandled GO_BACK. */
export function useDismissOnHardwareBack(
  router: ImperativeRouter,
  options: { enabled?: boolean; onBack?: () => void } = {},
): void {
  const enabled = options.enabled ?? true;
  const onBack = options.onBack;

  useFocusEffect(
    useCallback(() => {
      if (!enabled || Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (onBack) {
          onBack();
        } else {
          dismissOrHome(router);
        }
        return true;
      });
      return () => sub.remove();
    }, [enabled, onBack, router]),
  );
}
