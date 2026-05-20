/**
 * Chat message bubble — user or assistant.
 *
 * User messages: right-aligned, tinted background, plain text.
 * Assistant messages: left-aligned, markdown rendering, thinking/tool blocks.
 */
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Menu, Text } from 'react-native-paper';

import { AssistantStepsBlock, hasTextAfterIndex } from './AssistantStepsBlock';
import { AttachmentRenderer } from './AttachmentRenderer';
import { AudioMessageBlock } from './AudioMessageBlock';
import { MarkdownView } from './MarkdownView';
import { WorkspaceArtifactStrip } from './WorkspaceArtifactStrip';
import {
  collectAssistantWorkspaceOutputPaths,
  filterAssistantAttachmentsDedupedAgainstWorkspacePaths,
  imageContentBlocksToAttachments,
} from './assistant-message-artifacts';
import type { ImageContent, Message, MessageContent, ProgressState, ThinkingContent, ToolUseContent } from './messages.types';
import { useMessages } from '../../i18n/messages';
import { chatColors, chatLayout } from './styles';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Strip the envelope timestamp prefix that xopc prepends for model context.
 * Format: `[YYYY-MM-DD HH:MM ...] ` — kept for the model but hidden in UI.
 */
const ENVELOPE_TIMESTAMP_RE = /^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/;
function stripEnvelopeTimestampPrefix(text: string): string {
  return text.replace(ENVELOPE_TIMESTAMP_RE, '');
}

/**
 * Detect garbled / mojibake text that results from encoding mismatches
 * (e.g. GBK bytes decoded as Latin-1 then stored in UTF-8 JSON).
 *
 * Heuristic: if a significant portion of the text contains Unicode replacement
 * characters (U+FFFD) or characters from the Latin-1 Supplement block
 * (U+0080–U+00FF) that look like mojibake, flag it.
 *
 * Thresholds are intentionally generous to avoid false positives on normal
 * text that happens to contain a few accented characters.
 */
function isGarbledText(text: string): boolean {
  if (!text || text.length < 20) return false;

  // Count suspicious characters:
  // - U+FFFD: Unicode replacement character
  // - U+0080–U+00FF: Latin-1 Supplement (common mojibake range)
  // - Consecutive non-printable control characters
  let suspicious = 0;
  const len = Math.min(text.length, 500); // sample first 500 chars
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (
      code === 0xFFFD || // replacement char
      (code >= 0x0080 && code <= 0x00FF) || // Latin-1 supplement (mojibake)
      (code < 0x0020 && code !== 0x000A && code !== 0x000D && code !== 0x0009) // non-printable
    ) {
      suspicious++;
    }
  }

  // If more than 30% of sampled chars are suspicious, it's garbled
  return suspicious / len > 0.3;
}

const GARBLED_PLACEHOLDER = '⚠️ Content encoding error — text cannot be displayed correctly.';

const garbledStyles = StyleSheet.create({
  notice: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#9CA3AF',
    paddingVertical: 4,
  },
});

/** Extract all text blocks into a single string for user display. */
function userContentText(content: MessageContent[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => stripEnvelopeTimestampPrefix(b.text))
    .join('\n')
    .trim();
}

function userAudioBlocks(content: MessageContent[]): Extract<MessageContent, { type: 'audio' }>[] {
  return content.filter((b): b is Extract<MessageContent, { type: 'audio' }> => b.type === 'audio');
}

/**
 * Render content blocks for an assistant message.
 *
 * Consecutive thinking + tool_use blocks are grouped into a single
 * AssistantStepsBlock that auto-expands during streaming and collapses
 * once the final answer text starts flowing — matching web chat behaviour.
 */
function renderAssistantContent(
  content: MessageContent[],
  isStreaming: boolean,
  sessionKey?: string | null,
  allowTrailingMargin = false,
) {
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < content.length) {
    const block = content[i];

    // ── Group consecutive thinking / tool_use blocks ──
    if (block.type === 'thinking' || block.type === 'tool_use') {
      const start = i;
      const stepBlocks: Array<ThinkingContent | ToolUseContent> = [];
      while (
        i < content.length &&
        (content[i].type === 'thinking' || content[i].type === 'tool_use')
      ) {
        stepBlocks.push(content[i] as ThinkingContent | ToolUseContent);
        i++;
      }
      if (stepBlocks.length > 0) {
        const finalAnswerStarted = hasTextAfterIndex(content, i);
        nodes.push(
          <AssistantStepsBlock
            key={`steps-${start}`}
            blocks={stepBlocks}
            isMessageStreaming={isStreaming}
            finalAnswerStarted={finalAnswerStarted}
            sessionKey={sessionKey}
          />,
        );
      }
    } else if (block.type === 'text') {
      // Merge consecutive text blocks
      let merged = block.text || '';
      let j = i + 1;
      while (j < content.length && content[j].type === 'text') {
        merged += '\n' + ((content[j] as { text: string }).text || '');
        j++;
      }
      if (merged.trim()) {
        if (isGarbledText(merged)) {
          nodes.push(
            <Text key={`garbled-${i}`} style={garbledStyles.notice}>
              {GARBLED_PLACEHOLDER}
            </Text>,
          );
        } else {
          nodes.push(
            <MarkdownView
              key={`text-${i}`}
              content={merged}
              streaming={isStreaming}
              allowTrailingMargin={allowTrailingMargin}
            />,
          );
        }
      }
      i = j;
    } else if (block.type === 'image') {
      // Assistant images are shown in the dedicated artifact strip below the answer.
      i++;
    } else if (block.type === 'audio') {
      nodes.push(<AudioMessageBlock key={`audio-${i}`} audio={block} sessionKey={sessionKey} />);
      i++;
    } else {
      i++;
    }
  }

  // Streaming cursor: show blinking indicator while waiting or at the end of streamed content
  if (isStreaming) {
    nodes.push(
      <View key="cursor" style={styles.cursor}>
        <View style={[styles.cursorDot, { backgroundColor: chatColors.cursorBlink }]} />
      </View>,
    );
  }

  return nodes;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
  progress,
  sessionKey,
  onUserMessageCopy,
  onUserMessageEdit,
  onUserMessageRetry,
  onDeleteRound,
  onAssistantCopy,
}: {
  message: Message;
  isStreaming?: boolean;
  progress?: ProgressState | null;
  sessionKey?: string;
  onUserMessageCopy?: (text: string) => void;
  onUserMessageEdit?: (text: string) => void;
  onUserMessageRetry?: (text: string) => void;
  onDeleteRound?: (timestamp?: number) => void;
  onAssistantCopy?: (text: string) => void;
}) {
  const m = useMessages();
  const isDark = useColorScheme() === 'dark';
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [assistantMenuVisible, setAssistantMenuVisible] = useState(false);
  const isUser = message.role === 'user' || message.role === 'user-with-attachments';
  const isAssistant = message.role === 'assistant';

  const userText = useMemo(
    () => (isUser ? userContentText(message.content) : ''),
    [isUser, message.content],
  );

  const userAudio = useMemo(
    () => (isUser ? userAudioBlocks(message.content) : []),
    [isUser, message.content],
  );

  const displayContent = useMemo(
    () => (isAssistant ? (message.content ?? []).filter((b) => b.type !== 'image') : (message.content ?? [])),
    [isAssistant, message.content],
  );

  const assistantWorkspacePaths = useMemo(
    () => (isAssistant ? collectAssistantWorkspaceOutputPaths(message.content) : []),
    [isAssistant, message.content],
  );

  const assistantImageBlocks = useMemo(
    () =>
      isAssistant
        ? (message.content ?? []).filter((b): b is ImageContent => b.type === 'image' && Boolean(b.source?.data))
        : [],
    [isAssistant, message.content],
  );

  const assistantImageAttachments = useMemo(
    () => (isAssistant ? imageContentBlocksToAttachments(assistantImageBlocks) : []),
    [isAssistant, assistantImageBlocks],
  );

  const showAssistantArtifacts =
    isAssistant && (assistantWorkspacePaths.length > 0 || assistantImageAttachments.length > 0);

  const attachmentsForBubble = useMemo(() => {
    if (!isAssistant) return message.attachments;
    return filterAssistantAttachmentsDedupedAgainstWorkspacePaths(message.attachments, assistantWorkspacePaths);
  }, [isAssistant, message.attachments, assistantWorkspacePaths]);

  const showMeta =
    Boolean(message.timestamp) ||
    Boolean(progress?.message) ||
    (isStreaming && !message.content?.some((b) => b.type === 'thinking' && b.streaming));

  const assistantPlainText = useMemo(() => {
    if (!isAssistant) return '';
    return message.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }, [isAssistant, message.content]);

  const closeUserMenu = () => setUserMenuVisible(false);
  const closeAssistantMenu = () => setAssistantMenuVisible(false);

  const copyUserText = () => {
    closeUserMenu();
    if (userText.trim()) onUserMessageCopy?.(userText);
  };

  const editUserText = () => {
    closeUserMenu();
    if (userText.trim()) onUserMessageEdit?.(userText);
  };

  const retryUserText = () => {
    closeUserMenu();
    if (userText.trim()) onUserMessageRetry?.(userText);
  };

  const deleteRound = () => {
    closeUserMenu();
    onDeleteRound?.(message.timestamp);
  };

  const copyAssistantText = () => {
    closeAssistantMenu();
    if (assistantPlainText) onAssistantCopy?.(assistantPlainText);
  };

  return (
    <View style={chatLayout.messageBubbleRow}>
      {/* Timestamp / progress meta */}
      {showMeta ? (
        <View style={[styles.metaRow, isUser && styles.metaRowUser]}>
          {message.timestamp ? (
            <Text variant="labelSmall" style={styles.metaTime}>
              {formatTime(message.timestamp)}
            </Text>
          ) : null}
          {progress?.message ? (
            <Text variant="labelSmall" style={styles.metaProgress} numberOfLines={1}>
              {progress.message}
            </Text>
          ) : null}
          {isStreaming && !progress?.message ? (
            <Text variant="labelSmall" style={styles.metaProgress}>
              Thinking…
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Bubble */}
      {isUser ? (
        <Menu
          visible={userMenuVisible}
          onDismiss={closeUserMenu}
          anchor={
            <Pressable
              onLongPress={() => setUserMenuVisible(true)}
              delayLongPress={260}
              style={[
                chatLayout.userBubbleContainer,
                chatLayout.userBubble,
                {
                  backgroundColor: isDark
                    ? chatColors.userBubbleBgDark
                    : chatColors.userBubbleBg,
                },
              ]}
            >
              {userAudio.map((block, i) => (
                <AudioMessageBlock key={`user-audio-${i}`} audio={block} sessionKey={sessionKey} />
              ))}
              {userText ? (
                <Text
                  selectable
                  style={{
                    color: isDark ? '#E5E7EB' : '#1F2937',
                    fontSize: 15,
                    lineHeight: 22,
                  }}
                >
                  {userText}
                </Text>
              ) : null}
              {attachmentsForBubble?.length ? (
                <AttachmentRenderer attachments={attachmentsForBubble} sessionKey={sessionKey} compact />
              ) : null}
            </Pressable>
          }
        >
          <Menu.Item title={m.chat.messageCopy} leadingIcon="content-copy" onPress={copyUserText} />
          <Menu.Item title={m.chat.messageEdit} leadingIcon="pencil-outline" onPress={editUserText} />
          <Menu.Item title={m.chat.messageRetry} leadingIcon="refresh" onPress={retryUserText} />
          <Menu.Item title={m.chat.messageDeleteRound} leadingIcon="delete-outline" onPress={deleteRound} />
        </Menu>
      ) : (
        <View style={chatLayout.assistantBubbleContainer}>
          <Menu
            visible={assistantMenuVisible}
            onDismiss={closeAssistantMenu}
            anchor={
              <Pressable
                onLongPress={() => setAssistantMenuVisible(true)}
                delayLongPress={260}
                style={[
                  chatLayout.assistantBubble,
                  showAssistantArtifacts ? styles.markdownAboveArtifacts : null,
                  {
                    backgroundColor: isDark
                      ? chatColors.assistantBgDark
                      : chatColors.assistantBg,
                  },
                ]}
              >
                {renderAssistantContent(displayContent, isStreaming, sessionKey, showAssistantArtifacts)}

                {attachmentsForBubble?.length ? (
                  <AttachmentRenderer attachments={attachmentsForBubble} sessionKey={sessionKey} />
                ) : null}
              </Pressable>
            }
          >
            <Menu.Item title={m.chat.messageCopy} leadingIcon="content-copy" onPress={copyAssistantText} />
          </Menu>

          {showAssistantArtifacts ? (
            <View
              style={[
                styles.artifactCard,
                {
                  backgroundColor: isDark ? chatColors.assistantBgDark : chatColors.assistantBg,
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                },
              ]}
            >
              <Text style={[styles.artifactTitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                {m.chat.messageArtifactsHeading}
              </Text>
              <View style={styles.artifactBody}>
                {assistantWorkspacePaths.length > 0 ? (
                  <WorkspaceArtifactStrip paths={assistantWorkspacePaths} sessionKey={sessionKey} />
                ) : null}
                {assistantImageAttachments.length > 0 ? (
                  <AttachmentRenderer attachments={assistantImageAttachments} sessionKey={sessionKey} compact />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      )}

      {/* Usage badge */}
      {!isUser && message.usage?.totalTokens ? (
        <Text variant="labelSmall" style={styles.usage}>
          {message.usage.totalTokens.toLocaleString()} tokens
          {message.usage.cost != null ? ` · $${message.usage.cost.toFixed(4)}` : ''}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  metaRowUser: {
    justifyContent: 'flex-end',
  },
  metaTime: {
    color: chatColors.timestamp,
    fontSize: 11,
  },
  metaProgress: {
    color: chatColors.timestamp,
    fontSize: 11,
    fontStyle: 'italic',
  },
  cursor: {
    height: 20,
    justifyContent: 'center',
  },
  cursorDot: {
    width: 2,
    height: 14,
    borderRadius: 1,
    opacity: 0.7,
  },
  markdownAboveArtifacts: {
    paddingBottom: 4,
  },
  artifactCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    gap: 8,
  },
  artifactTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  artifactBody: {
    gap: 8,
  },
  usage: {
    color: chatColors.timestamp,
    fontSize: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
});
