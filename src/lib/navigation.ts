import { useFocusEffect } from '@react-navigation/native';
import type { Router } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Leave a modal (or any screen) without assuming a parent route exists.
 * Cold start / deep links can mount only `settings`, so `router.back()` throws LogBox "GO_BACK was not handled".
 */
export function dismissOrHome(router: Router): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/** Android hardware back when this screen is the only stack entry must not dispatch unhandled GO_BACK. */
export function useDismissOnHardwareBack(router: Router): void {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        dismissOrHome(router);
        return true;
      });
      return () => sub.remove();
    }, [router]),
  );
}
