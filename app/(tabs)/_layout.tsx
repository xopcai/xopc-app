/**
 * Bottom tab layout — Home / Chats / Notes.
 *
 * expo-router file-system route: app/(tabs)/_layout.tsx
 */
import { Tabs } from 'expo-router';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMessages } from '../../src/i18n/messages';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const m = useMessages();
  const insets = useSafeAreaInsets();
  const hp = m.homePage;

  const tabBarActiveTint = colors.accent.primary;
  const tabBarInactiveTint = colors.text.tertiary;
  const tabBarBackground = isDark ? '#000000' : '#FFFFFF';
  const tabBarBorder = colors.border.default;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBarActiveTint,
        tabBarInactiveTintColor: tabBarInactiveTint,
        tabBarStyle: {
          backgroundColor: tabBarBackground,
          borderTopColor: tabBarBorder,
          borderTopWidth: 0.5,
          paddingBottom: insets.bottom > 0 ? insets.bottom - 8 : 4,
          height: 52 + (insets.bottom > 0 ? insets.bottom - 8 : 4),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: hp.tabHome,
          tabBarIcon: ({ color, size }) => (
            <Icon source="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: hp.tabChats,
          tabBarIcon: ({ color, size }) => (
            <Icon source="chat-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: hp.tabNotes,
          tabBarIcon: ({ color, size }) => (
            <Icon source="note-text-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
