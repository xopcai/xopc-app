import { extractUserMessageText } from './composer-send-helpers';
import type { Message, MessageContent } from './messages.types';

function isUserMessage(message: Message): boolean {
  return message.role === 'user' || message.role === 'user-with-attachments';
}

function textContent(message: Message): string {
  return message.content
    .filter((block): block is Extract<MessageContent, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function audioKey(block: MessageContent): string {
  return block.type === 'audio'
    ? block.uri?.trim() || block.workspaceRelativePath?.trim() || block.name?.trim() || ''
    : '';
}

function assistantAudioKeys(message: Message): Set<string> {
  return new Set(message.content.map(audioKey).filter(Boolean));
}

function userMessageEquivalent(left: Message, right: Message): boolean {
  if (!isUserMessage(left) || !isUserMessage(right)) return false;
  const leftText = extractUserMessageText(left.content);
  const rightText = extractUserMessageText(right.content);
  if (leftText !== rightText) return false;
  const leftAttachmentCount = left.attachments?.length ?? 0;
  const rightAttachmentCount = right.attachments?.length ?? 0;
  return leftAttachmentCount === rightAttachmentCount;
}

function assistantMessageCoveredBySession(streaming: Message, committed: Message): boolean {
  if (streaming.role !== 'assistant' || committed.role !== 'assistant') return false;
  const streamingText = textContent(streaming);
  const committedText = textContent(committed);
  if (streamingText && !committedText.includes(streamingText)) return false;

  const committedAudio = assistantAudioKeys(committed);
  for (const key of assistantAudioKeys(streaming)) {
    if (!committedAudio.has(key)) return false;
  }
  return Boolean(streamingText || assistantAudioKeys(streaming).size > 0);
}

export function filterOptimisticMessagesCoveredBySession(
  sessionMessages: Message[],
  optimisticMessages: Message[],
): Message[] {
  if (!optimisticMessages.length || !sessionMessages.length) return optimisticMessages;
  const matchedCommittedIndexes = new Set<number>();
  return optimisticMessages.filter((optimistic) => {
    const committedIndex = sessionMessages.findIndex(
      (committed, index) =>
        !matchedCommittedIndexes.has(index) &&
        userMessageEquivalent(optimistic, committed),
    );
    if (committedIndex < 0) return true;
    matchedCommittedIndexes.add(committedIndex);
    return false;
  });
}

export function streamingMessageCoveredBySession(
  sessionMessages: Message[],
  streamingMsg: Message | null,
): boolean {
  if (!streamingMsg || !sessionMessages.length) return false;
  for (let i = sessionMessages.length - 1; i >= 0; i--) {
    const committed = sessionMessages[i];
    if (committed.role !== 'assistant') continue;
    return assistantMessageCoveredBySession(streamingMsg, committed);
  }
  return false;
}
