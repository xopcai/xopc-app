/**
 * Markdown renderer for chat messages.
 *
 * - **Dev client / release builds:** `react-native-enriched-markdown` (GFM, tables, streaming animation).
 * - **Expo Go:** that library has no native ViewManager — use a plain selectable `Text` fallback.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ComponentType } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { Linking, Platform, Text } from 'react-native';

import { ChatRenderErrorBoundary } from './ChatRenderErrorBoundary';
import { markdownNeedsPlainFallback } from './markdown-render-safety';
import { typography, useTheme, type ColorScheme } from '../../theme';

function createMarkdownStyle(themeColors: ColorScheme, isDark: boolean) {
  return {
    paragraph: {
      ...typography.body,
      color: themeColors.text.primary,
      marginBottom: 8,
    },
    h1: {
      ...typography.title,
      color: themeColors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    h2: {
      ...typography.heading,
      color: themeColors.text.primary,
      marginTop: 14,
      marginBottom: 6,
    },
    h3: {
      ...typography.heading,
      color: themeColors.text.primary,
      marginTop: 12,
      marginBottom: 4,
    },
    link: {
      color: themeColors.accent.primary,
      underline: false,
    },
    strong: {
      fontWeight: '600' as const,
    },
    code: {
      color: isDark ? '#F9A8D4' : '#DB2777',
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : themeColors.surface.input,
    },
    codeBlock: {
      backgroundColor: isDark ? '#1E1E1E' : themeColors.surface.input,
      color: themeColors.text.primary,
      ...typography.label,
      padding: 12,
      borderRadius: 8,
      marginBottom: 8,
    },
    blockquote: {
      backgroundColor: themeColors.surface.input,
      borderColor: themeColors.border.default,
      borderWidth: 3,
      color: themeColors.text.secondary,
    },
    list: {
      ...typography.body,
      color: themeColors.text.primary,
      marginLeft: 16,
      bulletColor: themeColors.text.secondary,
      markerColor: themeColors.text.secondary,
    },
    table: {
      ...typography.ui,
      color: themeColors.text.primary,
      borderColor: themeColors.border.default,
      borderRadius: 6,
      headerBackgroundColor: themeColors.surface.input,
      rowEvenBackgroundColor: isDark ? '#111827' : undefined,
      rowOddBackgroundColor: isDark ? '#1A1A2E' : undefined,
      cellPaddingHorizontal: 8,
      cellPaddingVertical: 8,
    },
    image: {
      borderRadius: 8,
      marginBottom: 4,
    },
  };
}

type MarkdownStyle = ReturnType<typeof createMarkdownStyle>;

type EnrichedProps = {
  markdown: string;
  flavor: 'github';
  markdownStyle: MarkdownStyle;
  streamingAnimation?: boolean;
  onLinkPress: (e: { url: string }) => void;
  selectable: boolean;
  allowTrailingMargin?: boolean;
};

/** Skip native streaming animation for large payloads — reduces native crash risk. */
const STREAMING_ANIMATION_MAX_CHARS = 8192;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function getEnrichedMarkdownText(): ComponentType<EnrichedProps> | null {
  if (Platform.OS === 'web' || isExpoGo()) return null;
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
  themeColors,
}: {
  content: string;
  themeColors: ColorScheme;
}) {
  const segments = useMemo(() => {
    const parts = content.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => ({ part, i, isUrl: /^https?:\/\//.test(part) }));
  }, [content]);

  return (
    <Text
      style={{ ...typography.body, marginBottom: 8, color: themeColors.text.primary }}
      selectable
    >
      {segments.map(({ part, i, isUrl }) =>
        isUrl ? (
          <Text
            key={i}
            style={{ color: themeColors.accent.primary, textDecorationLine: 'underline' }}
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

const EnrichedMarkdownBody = memo(function EnrichedMarkdownBody({
  content,
  streaming,
  allowTrailingMargin,
  Enriched,
  markdownStyle,
  themeColors,
  onLinkPress,
}: {
  content: string;
  streaming: boolean;
  allowTrailingMargin: boolean;
  Enriched: ComponentType<EnrichedProps>;
  markdownStyle: MarkdownStyle;
  themeColors: ColorScheme;
  onLinkPress: (e: { url: string }) => void;
}) {
  const useStreamingAnimation =
    streaming && content.length <= STREAMING_ANIMATION_MAX_CHARS;

  return (
    <ChatRenderErrorBoundary
      fallback={<PlainMarkdownFallback content={content} themeColors={themeColors} />}
    >
      <Enriched
        markdown={content}
        flavor="github"
        markdownStyle={markdownStyle as EnrichedProps['markdownStyle']}
        {...(useStreamingAnimation ? { streamingAnimation: true } : {})}
        onLinkPress={onLinkPress}
        selectable
        allowTrailingMargin={allowTrailingMargin}
      />
    </ChatRenderErrorBoundary>
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
  const { colors, isDark } = useTheme();
  const Enriched = useMemo(() => getEnrichedMarkdownText(), []);
  const markdownStyle = useMemo(() => createMarkdownStyle(colors, isDark), [colors, isDark]);

  const handleLinkPress = useCallback(({ url }: { url: string }) => {
    void Linking.openURL(url);
  }, []);

  if (!content?.trim()) return null;

  if (!Enriched || markdownNeedsPlainFallback(content)) {
    return <PlainMarkdownFallback content={content} themeColors={colors} />;
  }

  return (
    <EnrichedMarkdownBody
      content={content}
      streaming={streaming}
      allowTrailingMargin={allowTrailingMargin}
      Enriched={Enriched}
      markdownStyle={markdownStyle}
      themeColors={colors}
      onLinkPress={handleLinkPress}
    />
  );
});
