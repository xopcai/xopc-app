import { useMemo } from 'react';

import { usePreferencesStore } from '../stores/preferences-store';

export type ThemedStackScreenOptions = {
  headerStyle: { backgroundColor: string };
  headerTintColor: string;
  headerTitleStyle: { color: string };
  headerShadowVisible: boolean;
  contentStyle: { backgroundColor: string };
};

/** Effective dark mode from user preference (not raw system scheme). */
export function useResolvedIsDark(): boolean {
  return usePreferencesStore((s) => s.resolvedTheme === 'dark');
}

export function themedStackScreenOptions(isDark: boolean): ThemedStackScreenOptions {
  const bg = isDark ? '#000000' : '#F5F7FA';
  const fg = isDark ? '#F5F5F7' : '#1C1C1E';
  return {
    headerStyle: { backgroundColor: bg },
    headerTintColor: fg,
    headerTitleStyle: { color: fg },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: bg },
  };
}

export function useThemedStackScreenOptions(): ThemedStackScreenOptions {
  const isDark = useResolvedIsDark();
  return useMemo(() => themedStackScreenOptions(isDark), [isDark]);
}
