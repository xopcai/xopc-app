import { memo } from 'react';
import { Linking, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { chatColors } from './styles';
import type { WebSearchResultLink } from './web-search-tool-result-links';

export const WebSearchToolResultLinks = memo(function WebSearchToolResultLinks({
  links,
}: {
  links: WebSearchResultLink[];
}) {
  const isDark = useColorScheme() === 'dark';

  if (links.length === 0) return null;

  return (
    <View style={styles.container}>
      {links.map(({ url, title }) => (
        <Pressable
          key={url}
          style={[
            styles.chip,
            {
              backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.08)',
            },
          ]}
          onPress={() => {
            void Linking.openURL(url);
          }}
          accessibilityRole="link"
          accessibilityLabel={title}
        >
          <Icon source="open-in-new" size={12} color={chatColors.accent} />
          <Text
            variant="labelSmall"
            numberOfLines={1}
            style={[styles.title, { color: chatColors.accent }]}
          >
            {title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '500',
  },
});
