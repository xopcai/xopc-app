/**
 * Markdown renderer for chat messages.
 *
 * - **Dev client / release builds:** `react-native-enriched-markdown` (GFM, tables, streaming animation).
 * - **Expo Go:** that library has no native ViewManager — use a plain selectable `Text` fallback.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ComponentType } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { Linking, Text, useColorScheme } from 'react-native';

const lightStyle = {
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1F2937',
    marginBottom: 8,
  },
  h1: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  h2: {
    fontSize: 19,
    fontWeight: '600' as const,
    color: '#111827',
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 4,
  },
  link: {
    color: '#2563EB',
    underline: false,
  },
  strong: {
    fontWeight: 'bold' as const,
  },
  code: {
    color: '#DB2777',
    backgroundColor: '#F3F4F6',
  },
  codeBlock: {
    backgroundColor: '#F3F4F6',
    color: '#374151',
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  blockquote: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 3,
  },
  list: {
    fontSize: 15,
    marginLeft: 16,
    bulletColor: '#6B7280',
    markerColor: '#6B7280',
  },
  table: {
    fontSize: 14,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    headerBackgroundColor: '#F9FAFB',
    cellPaddingHorizontal: 8,
    cellPaddingVertical: 8,
  },
  image: {
    borderRadius: 8,
    marginBottom: 4,
  },
};

const darkStyle = {
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#E5E7EB',
    marginBottom: 8,
  },
  h1: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#F9FAFB',
    marginTop: 16,
    marginBottom: 8,
  },
  h2: {
    fontSize: 19,
    fontWeight: '600' as const,
    color: '#F9FAFB',
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#F3F4F6',
    marginTop: 12,
    marginBottom: 4,
  },
  link: {
    color: '#60A5FA',
    underline: false,
  },
  strong: {
    fontWeight: 'bold' as const,
  },
  code: {
    color: '#F9A8D4',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  codeBlock: {
    backgroundColor: '#1E1E1E',
    color: '#D4D4D4',
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  blockquote: {
    backgroundColor: '#1F2937',
    borderColor: '#4B5563',
    borderWidth: 3,
    color: '#D1D5DB',
  },
  list: {
    fontSize: 15,
    color: '#E5E7EB',
    marginLeft: 16,
    bulletColor: '#9CA3AF',
    markerColor: '#9CA3AF',
  },
  table: {
    fontSize: 14,
    color: '#E5E7EB',
    borderColor: '#374151',
    borderRadius: 6,
    headerBackgroundColor: '#1F2937',
    rowEvenBackgroundColor: '#111827',
    rowOddBackgroundColor: '#1A1A2E',
    cellPaddingHorizontal: 8,
    cellPaddingVertical: 8,
  },
  image: {
    borderRadius: 8,
    marginBottom: 4,
  },
};

type EnrichedProps = {
  markdown: string;
  flavor: 'github';
  markdownStyle: typeof lightStyle | typeof darkStyle;
  streamingAnimation: boolean;
  onLinkPress: (e: { url: string }) => void;
  selectable: boolean;
  allowTrailingMargin?: boolean;
};

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function getEnrichedMarkdownText(): ComponentType<EnrichedProps> | null {
  if (isExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoid loading native module in Expo Go
    const mod = require('react-native-enriched-markdown') as {
      EnrichedMarkdownText: ComponentType<EnrichedProps>;
    };
    return mod.EnrichedMarkdownText;
  } catch {
    return null;
  }
}

/** Expo Go / missing native module: show raw markdown as selectable text with tappable URLs. */
const PlainMarkdownFallback = memo(function PlainMarkdownFallback({
  content,
  isDark,
}: {
  content: string;
  isDark: boolean;
}) {
  const linkColor = isDark ? '#60A5FA' : '#2563EB';
  const bodyColor = isDark ? '#E5E7EB' : '#1F2937';

  const segments = useMemo(() => {
    const parts = content.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => ({ part, i, isUrl: /^https?:\/\//.test(part) }));
  }, [content]);

  return (
    <Text
      style={{ fontSize: 15, lineHeight: 22, marginBottom: 8, color: bodyColor }}
      selectable
    >
      {segments.map(({ part, i, isUrl }) =>
        isUrl ? (
          <Text
            key={i}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => void Linking.openURL(part)}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
});

export const MarkdownView = memo(function MarkdownView({
  content,
  streaming = false,
  allowTrailingMargin = false,
}: {
  content: string;
  /** When true, enables the streaming fade-in animation for new tokens (native renderer only). */
  streaming?: boolean;
  /**
   * When true, keeps marginBottom on the last markdown block in Yoga layout.
   * Use when another view (e.g. deliverables) sits directly below the markdown.
   */
  allowTrailingMargin?: boolean;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const Enriched = useMemo(() => getEnrichedMarkdownText(), []);
  const markdownStyle = useMemo(() => (isDark ? darkStyle : lightStyle), [isDark]);

  const handleLinkPress = useCallback(({ url }: { url: string }) => {
    void Linking.openURL(url);
  }, []);

  if (!content?.trim()) return null;

  if (!Enriched) {
    return <PlainMarkdownFallback content={content} isDark={isDark} />;
  }

  return (
    <Enriched
      markdown={content}
      flavor="github"
      markdownStyle={markdownStyle as EnrichedProps['markdownStyle']}
      streamingAnimation={streaming}
      onLinkPress={handleLinkPress}
      selectable
      allowTrailingMargin={allowTrailingMargin}
    />
  );
});
