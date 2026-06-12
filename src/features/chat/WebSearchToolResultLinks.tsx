import { memo, useState } from 'react';
import { Linking, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { chatColors } from './styles';
import type { WebSearchResultLink } from './web-search-tool-result-links';

const DEFAULT_VISIBLE_LINKS = 3;

function formatSummary(template: string, count: number): string {
  return template.replace(/\{\{count\}\}/g, String(count));
}

export const WebSearchToolResultLinks = memo(function WebSearchToolResultLinks({
  links,
  labels,
}: {
  links: WebSearchResultLink[];
  labels: {
    summary: string;
    showMore: string;
    showLess: string;
  };
}) {
  const isDark = useColorScheme() === 'dark';
  const [expanded, setExpanded] = useState(false);

  if (links.length === 0) return null;

  const visibleLinks = expanded ? links : links.slice(0, DEFAULT_VISIBLE_LINKS);
  const canToggle = links.length > DEFAULT_VISIBLE_LINKS;

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
        },
      ]}
    >
      <Text variant="labelSmall" style={[styles.summary, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
        {formatSummary(labels.summary, links.length)}
      </Text>

      <View style={styles.links}>
        {visibleLinks.map(({ url, title, host }) => (
          <Pressable
            key={url}
            style={styles.linkRow}
            onPress={() => {
              void Linking.openURL(url);
            }}
            accessibilityRole="link"
            accessibilityLabel={title}
          >
            <Icon source="open-in-new" size={12} color={isDark ? '#9CA3AF' : '#6B7280'} />
            <Text
              variant="bodySmall"
              numberOfLines={1}
              style={[styles.host, { color: isDark ? '#9CA3AF' : '#6B7280' }]}
            >
              {host}
            </Text>
            <Text
              variant="bodySmall"
              numberOfLines={1}
              style={[styles.title, { color: chatColors.accent }]}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </View>

      {canToggle ? (
        <Pressable
          style={styles.toggle}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? labels.showLess : labels.showMore}
        >
          <Text variant="labelSmall" style={styles.toggleText}>
            {expanded ? labels.showLess : labels.showMore}
          </Text>
          <Icon
            source={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={chatColors.timestamp}
          />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  summary: {
    fontSize: 11,
    fontWeight: '500',
  },
  links: {
    gap: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 24,
  },
  host: {
    maxWidth: 88,
    fontSize: 11,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
  },
  toggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 28,
  },
  toggleText: {
    fontSize: 11,
    color: chatColors.timestamp,
  },
});
