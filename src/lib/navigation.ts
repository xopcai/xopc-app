import { useFocusEffect, type ImperativeRouter } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

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

/**
 * Leave a modal (or any screen) without assuming a parent route exists.
 * Cold start / deep links can mount only `settings`, so `router.back()` throws LogBox "GO_BACK was not handled".
 */
export function dismissOrHome(router: ImperativeRouter): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)');
  }
}

/** Android hardware back when this screen is the only stack entry must not dispatch unhandled GO_BACK. */
export function useDismissOnHardwareBack(
  router: ImperativeRouter,
  options: { enabled?: boolean } = {},
): void {
  const enabled = options.enabled ?? true;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        dismissOrHome(router);
        return true;
      });
      return () => sub.remove();
    }, [enabled, router]),
  );
}
